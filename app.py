from flask import Flask, render_template, request, redirect, url_for, flash, send_file
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date, timedelta
from sqlalchemy import func
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.units import inch
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from email.mime.text import MIMEText
import json

app = Flask(__name__)
app.secret_key = "dev-secret-key"

# Base de datos
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///facturacion.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# ----------------- MODELOS -----------------
class Producto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    precio = db.Column(db.Float, nullable=False)
    stock = db.Column(db.Integer, nullable=False)

class Cliente(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    dni = db.Column(db.String(20), nullable=True)

class Venta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=False)
    fecha = db.Column(db.DateTime, default=datetime.now)
    total = db.Column(db.Float, nullable=False)
    cliente = db.relationship("Cliente", backref=db.backref("ventas", lazy=True))

class VentaItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    venta_id = db.Column(db.Integer, db.ForeignKey('venta.id'), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey('producto.id'), nullable=False)
    cantidad = db.Column(db.Integer, nullable=False)
    precio_unitario = db.Column(db.Float, nullable=False)
    producto = db.relationship("Producto")
    venta = db.relationship("Venta", backref=db.backref("items", lazy=True))

# ----------------- RUTAS -----------------

@app.route("/")
def index():
    productos = Producto.query.all()
    ventas = Venta.query.order_by(Venta.fecha.desc()).all()

    # --- Lógica para el Panel de Control ---
    
    # 1. Número total de productos en stock
    total_productos_stock = db.session.query(func.sum(Producto.stock)).scalar()
    if total_productos_stock is None:
        total_productos_stock = 0

    # 2. Ingresos totales
    ingresos_totales = db.session.query(func.sum(Venta.total)).scalar()
    if ingresos_totales is None:
        ingresos_totales = 0.0

    # 3. Número de ventas diarias (hoy) y semanales
    hoy = date.today()
    ventas_hoy = Venta.query.filter(func.date(Venta.fecha) == hoy).count()
    
    semana_pasada = datetime.now() - timedelta(days=7)
    ventas_semanales = Venta.query.filter(Venta.fecha >= semana_pasada).count()

    # 4. Productos más vendidos
    productos_mas_vendidos = db.session.query(
        Producto.nombre, func.sum(VentaItem.cantidad).label('total_vendido')
    ).join(VentaItem, Producto.id == VentaItem.producto_id).group_by(Producto.nombre).order_by(func.sum(VentaItem.cantidad).desc()).limit(5).all()

    return render_template('index.html',
                           productos=productos,
                           ventas=ventas,
                           total_productos_stock=total_productos_stock,
                           ingresos_totales=ingresos_totales,
                           ventas_hoy=ventas_hoy,
                           ventas_semanales=ventas_semanales,
                           productos_mas_vendidos=productos_mas_vendidos)

@app.route("/producto/agregar", methods=["POST"])
def agregar_producto():
    nombre = request.form["nombre"]
    precio = float(request.form["precio"])
    stock = int(request.form["stock"])
    nuevo_producto = Producto(nombre=nombre, precio=precio, stock=stock)
    db.session.add(nuevo_producto)
    db.session.commit()
    flash("Producto agregado correctamente", "success")
    return redirect(url_for("index"))

@app.route("/producto/eliminar/<int:id>")
def eliminar_producto(id):
    producto = Producto.query.get_or_404(id)
    db.session.delete(producto)
    db.session.commit()
    flash("Producto eliminado correctamente", "success")
    return redirect(url_for("index"))

@app.route("/producto/editar/<int:id>", methods=["POST"])
def editar_producto(id):
    producto = Producto.query.get_or_404(id)
    producto.nombre = request.form["nombre"]
    producto.precio = float(request.form["precio"])
    producto.stock = int(request.form["stock"])
    db.session.commit()
    flash("Producto editado correctamente", "success")
    return redirect(url_for("index"))

@app.route("/venta/nueva", methods=["POST"])
def nueva_venta():
    data = request.json
    nombre_cliente = data.get("nombre_cliente")
    email_cliente = data.get("email_cliente")
    dni_cliente = data.get("dni_cliente")

    # Buscar cliente por DNI (identificador único real)
    cliente = Cliente.query.filter_by(dni=dni_cliente).first()

    # Si no existe, lo creo nuevo
    if not cliente:
        cliente = Cliente(nombre=nombre_cliente, email=email_cliente, dni=dni_cliente)
        db.session.add(cliente)
        db.session.commit()

    # Crear la venta
    total = 0
    venta = Venta(cliente_id=cliente.id, total=0)
    db.session.add(venta)
    db.session.commit()

    # Agregar productos a la venta
    productos_vendidos = data.get("productos")
    for item_data in productos_vendidos:
        producto_id = item_data.get("producto_id")
        cantidad = item_data.get("cantidad")

        producto = Producto.query.get(int(producto_id))
        if producto and cantidad > 0 and producto.stock >= cantidad:
            total += producto.precio * cantidad
            producto.stock -= cantidad
            item = VentaItem(
                venta_id=venta.id,
                producto_id=producto.id,
                cantidad=cantidad,
                precio_unitario=producto.precio
            )
            db.session.add(item)

    # Guardar total final
    venta.total = total
    db.session.commit()

    # Generar PDF y enviar email
    pdf_data = generar_pdf(venta)
    enviar_email(cliente.email, pdf_data)

    flash("Venta registrada y factura enviada", "success")
    return "Venta registrada", 200

# ----------------- FUNCIONES AUXILIARES -----------------
from reportlab.platypus import Image

def generar_pdf(venta):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    story = []
    styles = getSampleStyleSheet()

    # Estilos personalizados
    styles.add(ParagraphStyle(name='FacturaTitulo', fontSize=26, fontName='Helvetica-Bold',
                             alignment=1, spaceAfter=20, textColor=colors.HexColor("#D32F2F")))
    styles.add(ParagraphStyle(name='NormalGray', fontSize=10, fontName='Helvetica',
                             textColor=colors.gray))
    styles.add(ParagraphStyle(name='TableHeader', fontSize=11, fontName='Helvetica-Bold',
                             textColor=colors.white, alignment=1))
    styles.add(ParagraphStyle(name='TotalGrande', fontSize=14, fontName='Helvetica-Bold',
                             textColor=colors.HexColor("#D32F2F"), alignment=2))


    # Logo
    logo = Image("static/img/arca.png", width=100, height=50)  # Ajusta tamaño según necesidad

    # Encabezado con logo + datos empresa y cliente
    empresa_info = """
    <b>Arca Continental</b><br/>
    Calle Maria de Quiroga, Ciudad de La Rioja<br/>
    RFC: http://www.arcacontal.com/<br/>
    Tel: 03804-901110
    """
    cliente_info = f"""
    <b>Factura N°:</b> {venta.id}<br/>
    <b>Fecha:</b> {venta.fecha.strftime('%d/%m/%Y')}<br/><br/>
    <b>Facturado a:</b><br/>{venta.cliente.nombre}<br/>
    DNI: {venta.cliente.dni}<br/> 
    Email: {venta.cliente.email}
    """

    table_header = Table(
        [[logo, Paragraph(empresa_info, styles['NormalGray']),
          Paragraph(cliente_info, styles['NormalGray'])]],
        colWidths=[1.2*inch, 2.8*inch, 2.5*inch] # Ajustado el ancho de la primera columna (logo) y la segunda (empresa)
    )
    table_header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), # Alineación vertical de todas las celdas
        ('ALIGN', (0, 0), (0, 0), 'CENTER'), # Centra horizontalmente el logo en su celda
        ('VALIGN', (0, 0), (0, 0), 'MIDDLE'), # Centra verticalmente el logo en su celda
        ('ALIGN', (1, 0), (1, 0), 'LEFT'),
        ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))

    # Título
    story.append(Paragraph("FACTURA", styles['FacturaTitulo']))
    story.append(table_header)
    story.append(Spacer(1, 15))

    # Tabla de productos
    data_productos = [
        [Paragraph("Producto", styles['TableHeader']),
         Paragraph("Cantidad", styles['TableHeader']),
         Paragraph("P. Unitario", styles['TableHeader']),
         Paragraph("Subtotal", styles['TableHeader'])]
    ]

    total_neto = 0.0
    for i, item in enumerate(venta.items):
        subtotal = item.cantidad * item.precio_unitario
        data_productos.append([
            item.producto.nombre,
            str(item.cantidad),
            f"${item.precio_unitario:.2f}",
            f"${subtotal:.2f}"
        ])
        total_neto += subtotal

    table_productos = Table(data_productos, colWidths=[2.5*inch, 1*inch, 1.25*inch, 1.25*inch])
    table_productos.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#D32F2F")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
        ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.lightgrey]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
    ]))
    story.append(table_productos)
    story.append(Spacer(1, 20))

    # Resumen de totales
    iva = total_neto * 0.16
    total_con_iva = total_neto + iva

    data_resumen = [
        ["Subtotal:", f"${total_neto:.2f}"],
        ["IVA (16%):", f"${iva:.2f}"],
        [Paragraph("<b>TOTAL:</b>", styles['TotalGrande']),
         Paragraph(f"<b>${total_con_iva:.2f}</b>", styles['TotalGrande'])]
    ]
    table_resumen = Table(data_resumen, colWidths=[4.5*inch, 1.5*inch])
    table_resumen.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor("#FFEBEE")),
        ('BOX', (0, 2), (-1, 2), 1, colors.HexColor("#D32F2F")),
    ]))
    story.append(table_resumen)
    story.append(Spacer(1, 25))

    # Pie de página
    story.append(Paragraph("Gracias por su compra. ¡Esperamos verlo pronto!", styles['NormalGray']))

    doc.build(story)
    buffer.seek(0)
    return buffer

def enviar_email(destinatario, pdf_data):
    remitente = "jimeenaa13@gmail.com"
    password = "nshw zuxt rvwg ztpq"
    asunto = "Factura de su compra"
    cuerpo = "Adjuntamos la factura de su compra."

    msg = MIMEMultipart()
    msg["From"] = remitente
    msg["To"] = destinatario
    msg["Subject"] = asunto
    msg.attach(MIMEText(cuerpo, "plain"))

    part = MIMEApplication(pdf_data.read(), _subtype="pdf")
    part.add_header("Content-Disposition", "attachment", filename=f"factura.pdf")
    msg.attach(part)

    pdf_data.seek(0)

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(remitente, password)
        server.send_message(msg)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)