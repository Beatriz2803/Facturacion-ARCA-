// main.js - Sistema de Gestión de Productos y Ventas

// Usamos jQuery para asegurar que el DOM está listo
$(document).ready(function() {
    
    // === INICIALIZACIÓN DE PLUGINS ===
    
    // 1. Inicializar DataTables para las tablas de inventario y ventas
    $('#tabla-inventario, #tabla-ventas').DataTable({
        language: {
            "processing": "Procesando...",
            "lengthMenu": "Mostrar _MENU_ registros",
            "zeroRecords": "No se encontraron resultados",
            "emptyTable": "Ningún dato disponible en esta tabla",
            "info": "Mostrando registros del _START_ al _END_ de un total de _TOTAL_ registros",
            "infoEmpty": "Mostrando registros del 0 al 0 de un total de 0 registros",
            "infoFiltered": "(filtrado de un total de _MAX_ registros)",
            "search": "Buscar:",
            "loadingRecords": "Cargando...",
            "paginate": {
                "first": "Primero",
                "last": "Último",
                "next": "Siguiente",
                "previous": "Anterior"
            },
            "aria": {
                "sortAscending": ": Activar para ordenar la columna de manera ascendente",
                "sortDescending": ": Activar para ordenar la columna de manera descendente"
            }
        }
    });

    // 2. Inicializar Select2 para el buscador de productos
        var $select = $('#select-producto');

        $select.select2({
            theme: 'bootstrap-5',
            placeholder: 'Busca o selecciona un producto...',
            allowClear: true
        });

        $select.removeClass('form-select').css('display', 'none');
    
    // === LÓGICA DE LA APLICACIÓN ===
    
    const formVenta = document.getElementById('form-nueva-venta');
    const selectProducto = document.getElementById('select-producto');
    const btnAgregarItem = document.getElementById('btn-agregar-item');
    const listaProductosVenta = document.getElementById('lista-productos-venta');
    
    let productosEnVenta = [];

        /* ---------- Navegación entre secciones (anclas + show/hide) ---------- */
    (function() {
        // IDs de secciones
        const sections = ['panel', 'ventas', 'stock', 'historial'];

        function showSection(id, updateHash = true) {
            sections.forEach(s => {
                const el = document.getElementById(s);
                if (!el) return;
                el.style.display = (s === id) ? '' : 'none';
            });

            // Marcar link activo
            document.querySelectorAll('#mainNav .nav-link').forEach(a => {
                if (a.getAttribute('data-target') === id) {
                    a.classList.add('active');
                } else {
                    a.classList.remove('active');
                }
            });

            if (updateHash) {
                history.replaceState(null, '', '#' + id);
            }

            // Re-inicializar componentes si es necesario cuando se muestra la sección
            if (id === 'ventas') {
                // si usás select2 en ventas, re-inicializa (en caso que no esté)
                if ($('#select-producto').data('select2')) {
                    $('#select-producto').select2('destroy');
                }
                $('#select-producto').select2({
                    theme: 'bootstrap-5',
                    placeholder: 'Busca o selecciona un producto...',
                    allowClear: true
                });
            }

            if (id === 'stock') {
                // Si existe tabla de inventario, reinicializar DataTable si no está
                if (document.getElementById('tabla-inventario') && !$.fn.DataTable.isDataTable('#tabla-inventario')) {
                    $('#tabla-inventario').DataTable();
                }
            }

            if (id === 'historial') {
                if (document.getElementById('tabla-ventas') && !$.fn.DataTable.isDataTable('#tabla-ventas')) {
                    $('#tabla-ventas').DataTable();
                }
            }
        }



// Capturar clicks en el nav
document.querySelectorAll('#mainNav .nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
        const href = this.getAttribute('href'); 
        
        if (href.startsWith('#')) {
            e.preventDefault(); // Prevenimos la navegación solo para anclas internas
            const target = this.getAttribute('data-target') || href.substring(1);
            showSection(target, true);
            // scroll suave opcional:
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

        // Si hay hash en la URL, mostrarla; si no, panel por defecto
        const initial = (location.hash) ? location.hash.replace('#','') : 'panel';
        // Esperar micro-tick para permitir que DOM esté listo
        setTimeout(() => { showSection(initial, false); }, 10);
    })();

    // Función para agregar el producto seleccionado a la lista
    function agregarProductoALaVenta() {
        const selectedOption = selectProducto.options[selectProducto.selectedIndex];
        if (!selectedOption || !selectedOption.value) return;

        const productoId = selectedOption.value;
        const productoNombre = selectedOption.text.split('(')[0].trim();
        const productoPrecio = parseFloat(selectedOption.dataset.precio);
        const productoStock = parseInt(selectedOption.dataset.stock);

        if (productosEnVenta.find(item => item.id === productoId)) {
            alert('Este producto ya ha sido agregado a la venta.');
            return;
        }
        if (productoStock < 1) {
            alert('No hay stock disponible para este producto.');
            return;
        }

        productosEnVenta.push({
            id: productoId, 
            nombre: productoNombre, 
            precio: productoPrecio,
            stock: productoStock, 
            cantidad: 1
        });
        
        renderizarItemsVenta();
        // Limpiar Select2 para la próxima selección
        $('#select-producto').val(null).trigger('change');
    }

    btnAgregarItem.addEventListener('click', agregarProductoALaVenta);
    // También agregar al presionar enter en la búsqueda
    $('#select-producto').on('select2:select', agregarProductoALaVenta);

    // Función para renderizar los items de la venta
    function renderizarItemsVenta() {
        listaProductosVenta.innerHTML = '';
        productosEnVenta.forEach((item, index) => {
            const li = document.createElement('div');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <div>${item.nombre} - <strong>$${item.precio.toFixed(2)}</strong></div>
                <div class="d-flex align-items-center">
                    <input type="number" min="1" max="${item.stock}" value="${item.cantidad}" class="form-control form-control-sm me-2" style="width: 70px;" data-index="${index}">
                    <button type="button" class="btn btn-sm btn-outline-danger" data-index="${index}"><i class="bi bi-x-lg"></i></button>
                </div>
            `;
            listaProductosVenta.appendChild(li);
        });
        asignarEventosItems();
    }

    // Función para asignar eventos a los items de la venta
    function asignarEventosItems() {
        document.querySelectorAll('#lista-productos-venta input[type="number"]').forEach(input => {
            input.addEventListener('change', function() {
                const index = parseInt(this.dataset.index);
                let nuevaCantidad = parseInt(this.value);
                if (nuevaCantidad < 1) { 
                    nuevaCantidad = 1; 
                } else if (nuevaCantidad > productosEnVenta[index].stock) {
                    nuevaCantidad = productosEnVenta[index].stock;
                    alert('La cantidad no puede superar el stock disponible.');
                }
                this.value = nuevaCantidad;
                productosEnVenta[index].cantidad = nuevaCantidad;
            });
        });
        
        document.querySelectorAll('#lista-productos-venta button.btn-outline-danger').forEach(button => {
            button.addEventListener('click', function() {
                productosEnVenta.splice(parseInt(this.dataset.index), 1);
                renderizarItemsVenta();
            });
        });
    }

    // Evento submit del formulario de venta
    formVenta.addEventListener('submit', function(event) {
        event.preventDefault();
        
        if (productosEnVenta.length === 0) {
            alert('Debes agregar al menos un producto a la venta.');
            return;
        }
        
        const productos = productosEnVenta.map(item => ({
            producto_id: parseInt(item.id),
            cantidad: parseInt(item.cantidad)
        }));
        
        fetch('/venta/nueva', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                nombre_cliente: document.getElementById('nombre_cliente').value,
                dni_cliente: document.getElementById('dni_cliente').value,
                email_cliente: document.getElementById('email_cliente').value,
                productos: productos
            })
        })
     
        .then(response => {
            if (response.ok) {
                // TRUCO: Forzamos el hash #ventas antes de recargar
                // Así el navegador vuelve a abrir esta sección y muestra la alerta.
                window.location.hash = 'ventas'; 
                window.location.reload();
            } else {
                alert('Error al registrar la venta...');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Ocurrió un error al procesar la solicitud.');
        });
    });

    // Eventos para editar productos
    document.querySelectorAll('.btn-editar-producto').forEach(button => {
        button.addEventListener('click', function() {
            const id = this.dataset.id;
            document.getElementById('form-editar-producto').action = `/producto/editar/${id}`;
            document.getElementById('edit-nombre').value = this.dataset.nombre;
            document.getElementById('edit-precio').value = this.dataset.precio;
            document.getElementById('edit-stock').value = this.dataset.stock;
        });
    });

    // === ATAJOS DE TECLADO ===
    document.addEventListener('keydown', function(event) {
        // Atajo Alt + N para ir al campo "nombre" para agregar un nuevo producto
        if (event.altKey && event.key.toLowerCase() === 'n') {
            event.preventDefault();
            document.getElementById('nombre').focus();
        }
    });

    // === GRÁFICO DE VENTAS SEMANALES (CHART.JS) ===
    const canvas = document.getElementById('graficoVentasSemana');

    // DIAGNÓSTICO: Verificamos en la consola si todo existe
    if (!canvas) {
        console.error("Error: No encuentro el canvas con id 'graficoVentasSemana'");
        return;
    }
    if (typeof ingresosSemana === 'undefined') {
        console.error("Error: La variable 'ingresosSemana' no está definida. Revisa tu HTML.");
        return;
    }

    console.log("Datos cargados correctamente:", ingresosSemana); // Para ver si llegan datos

    const ctx = canvas.getContext('2d');

    // Degradado Rojo
    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(230, 0, 35, 1)');
    gradient.addColorStop(1, 'rgba(230, 0, 35, 0.2)');

    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ingresosSemana.labels,
            datasets: [{
                label: 'Ingresos ($)',
                data: ingresosSemana.datos,
                backgroundColor: gradient,
                borderColor: 'rgba(230, 0, 35, 1)',
                borderWidth: 1,
                borderRadius: 5,
                barPercentage: 0.6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // ¡IMPORTANTE PARA QUE SE VEA!
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += '$' + context.parsed.y.toLocaleString('es-AR', {minimumFractionDigits: 2});
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)', borderDash: [5, 5] },
                    ticks: { color: '#cccccc' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#ffffff' }
                }
            }
        }
    });
});
// Función para imprimir solo la factura del modal abierto
function imprimirFactura(modalId) {
    // Obtener el contenido de la factura del modal específico
    const modal = document.getElementById(modalId);
    const invoiceContent = modal.querySelector('.invoice-container');
    
    // Crear una ventana temporal con solo el contenido de la factura
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Escribir el HTML con estilos en la nueva ventana
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Factura - Arca Continental</title>
            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                :root {
                    --coca-cola-red: #E60023;
                    --coca-cola-dark: #333333;
                    --coca-cola-light-gray: #F5F5F5;
                    --coca-cola-white: #FFFFFF;
                }
                
                body {
                    font-family: 'Montserrat', sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: white;
                }
                
                .invoice-container {
                    width: 100%;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 40px;
                    background-color: var(--coca-cola-white);
                    border: 1px solid #ddd;
                }
                
                .invoice-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                }
                
                .invoice-header .logo {
                    max-height: 80px;
                }
                
                .invoice-header h1 {
                    color: var(--coca-cola-red);
                    font-size: 2.5rem;
                    margin: 0;
                }
                
                .invoice-company-info, .invoice-client-info {
                    line-height: 1.6;
                    font-size: 0.9rem;
                }
                
                .invoice-details {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 30px;
                    border-top: 2px solid var(--coca-cola-light-gray);
                    border-bottom: 2px solid var(--coca-cola-light-gray);
                    padding: 15px 0;
                }
                
                .invoice-details h4 {
                    font-weight: 600;
                    color: var(--coca-cola-dark);
                    margin-bottom: 5px;
                }
                
                .invoice-details p {
                    margin: 0;
                }
                
                .text-end {
                    text-align: right;
                }
                
                .invoice-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 30px;
                }
                
                .invoice-table thead th {
                    text-align: left;
                    padding: 12px 10px;
                    background-color: var(--coca-cola-red);
                    color: var(--coca-cola-white);
                    font-weight: 600;
                }
                
                .invoice-table tbody td {
                    text-align: left;
                    padding: 10px;
                    border-bottom: 1px solid var(--coca-cola-light-gray);
                }
                
                .invoice-summary {
                    display: flex;
                    justify-content: flex-end;
                    text-align: right;
                }
                
                .invoice-summary-table {
                    width: 300px;
                }
                
                .invoice-summary-table td {
                    padding: 8px 0;
                    font-weight: 600;
                }
                
                .invoice-summary-table .total-label {
                    font-size: 1.2rem;
                    color: var(--coca-cola-red);
                }
                
                .invoice-summary-table .total-amount {
                    font-size: 1.2rem;
                    font-weight: 700;
                    color: var(--coca-cola-red);
                }
                
                .invoice-footer {
                    text-align: center;
                    font-size: 0.8rem;
                    color: #888;
                    margin-top: 50px;
                }
                
                @media print {
                    body {
                        padding: 0;
                    }
                    
                    .invoice-container {
                        border: none;
                        box-shadow: none;
                    }
                }
            </style>
        </head>
        <body>
            ${invoiceContent.outerHTML}
        </body>
        </html>
    `);
    
    // Esperar a que cargue el contenido y luego imprimir
    printWindow.document.close();
    printWindow.focus();
    
    // Dar tiempo para que carguen las imágenes
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}
window.imprimirFactura = imprimirFactura;