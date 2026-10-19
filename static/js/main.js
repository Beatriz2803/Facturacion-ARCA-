// Usamos jQuery para asegurar que el DOM está listo
$(document).ready(function() {
    
    // --- 1. CONFIGURACIÓN GENERAL ---
    
    const opcionesIdioma = {
        "processing": "Procesando...",
        "lengthMenu": "Mostrar _MENU_ registros",
        "zeroRecords": "No se encontraron resultados",
        "emptyTable": "Ningún dato disponible en esta tabla",
        "info": "Mostrando registros del _START_ al _END_ de un total de _TOTAL_ registros",
        "infoFiltered": "(filtrado de un total de _MAX_ registros)",
        "search": "Buscar:",
        "paginate": {
            "first": "Primero",
            "last": "Último",
            "next": "Siguiente",
            "previous": "Anterior"
        }
    };

    // --- 2. INICIALIZACIÓN DE TABLAS (Solo si existen) ---

    if ($('#tabla-inventario').length) {
        $('#tabla-inventario').DataTable({
            language: opcionesIdioma
        });
    }

    if ($('#tabla-ventas').length) {
        $('#tabla-ventas').DataTable({
            language: opcionesIdioma,
            searching: false, // Buscador desactivado porque usamos el filtro de Python
            lengthChange: false,
            order: [[0, 'desc']]
        });
    }

    // --- 3. INICIALIZACIÓN DE SELECT2 (Solo si existe el select) ---
    
    var $select = $('#select-producto');
    if ($select.length) {
        $select.select2({
            theme: 'bootstrap-5',
            placeholder: 'Busca o selecciona un producto...',
            allowClear: true,
            width: '100%' // Asegura que ocupe el ancho correcto
        });
    }

    // --- 4. LÓGICA DE VENTAS (Solo si estamos en la sección ventas) ---
    
    const formVenta = document.getElementById('form-nueva-venta');
    
    // Solo ejecutamos esto si el formulario de venta existe en el DOM
    if (formVenta) {
        const selectProducto = document.getElementById('select-producto');
        const btnAgregarItem = document.getElementById('btn-agregar-item');
        const listaProductosVenta = document.getElementById('lista-productos-venta');
        
        let productosEnVenta = [];

        // Función para agregar el producto seleccionado a la lista
        function agregarProductoALaVenta() {
            // Usamos jQuery para obtener el valor de Select2 correctamente
            const selectedData = $(selectProducto).select2('data')[0];
            
            if (!selectedData || !selectedData.element) return;

            const element = selectedData.element;
            const productoId = element.value;
            // Limpiamos el texto para quitar el precio del nombre visual
            const productoNombre = selectedData.text.split('(')[0].trim(); 
            const productoPrecio = parseFloat(element.dataset.precio);
            const productoStock = parseInt(element.dataset.stock);

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
        document.getElementById('btn-registrar-venta').addEventListener('click', function(event) {
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
                    // CAMBIO CLAVE: Redirigir a la URL limpia controlada por Python
                    window.location.href = '/ventas'; 
                } else {
                    alert('Error al registrar la venta...');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Ocurrió un error al procesar la solicitud.');
            });
        });
    }

    // --- 5. LÓGICA DE STOCK (Edición) ---

    // Eventos para editar productos (Delegación de eventos o directos)
    // Usamos delegación (on click en document) por si la tabla paginó y los botones cambiaron
    $(document).on('click', '.btn-editar-producto', function() {
        const id = $(this).data('id');
        const nombre = $(this).data('nombre');
        const precio = $(this).data('precio');
        const stock = $(this).data('stock');

        $('#form-editar-producto').attr('action', `/producto/editar/${id}`);
        $('#edit-nombre').val(nombre);
        $('#edit-precio').val(precio);
        $('#edit-stock').val(stock);
    });

    // Atajo de teclado Alt + N
    document.addEventListener('keydown', function(event) {
        if (event.altKey && event.key.toLowerCase() === 'n') {
            const inputNombre = document.getElementById('new_nombre');
            if (inputNombre) {
                event.preventDefault();
                inputNombre.focus();
            }
        }
    });

    // --- 6. GRÁFICO (Chart.js) ---
    
    const canvas = document.getElementById('graficoVentasSemana');
    if (canvas && typeof ingresosSemana !== 'undefined' && ingresosSemana.labels && ingresosSemana.labels.length > 0) {
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
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
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
    }

    // --- 7. RESALTAR MENÚ ACTIVO ---
    // Compara la URL actual con los enlaces del menú y agrega la clase active
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('fw-bold', 'text-warning'); // Resaltar
        } else {
            link.classList.remove('fw-bold', 'text-warning');
        }
    });

});

// --- 8. FUNCIÓN IMPRIMIR (Global) ---
function imprimirFactura(modalId) {
    const modal = document.getElementById(modalId);
    const invoiceContent = modal.querySelector('.invoice-container');
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Factura - Arca Continental</title>
            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Montserrat', sans-serif; padding: 20px; }
                .invoice-container { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 40px; }
                .invoice-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
                .invoice-header h1 { color: #E60023; font-size: 2.5rem; margin: 0; }
                .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                .invoice-table th { background-color: #E60023; color: white; padding: 10px; text-align: left; }
                .invoice-table td { border-bottom: 1px solid #eee; padding: 10px; }
                .text-end { text-align: right; }
                .invoice-summary { display: flex; justify-content: flex-end; }
                @media print { .invoice-container { border: none; } }
            </style>
        </head>
        <body>
            ${invoiceContent.outerHTML}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}
// Hacer disponible globalmente
window.imprimirFactura = imprimirFactura;