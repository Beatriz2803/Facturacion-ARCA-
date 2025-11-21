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
    $('#select-producto').select2({
        theme: 'bootstrap-5',
        placeholder: 'Busca o selecciona un producto...',
        allowClear: true
    });

    // === LÓGICA DE LA APLICACIÓN ===
    
    const formVenta = document.getElementById('form-nueva-venta');
    const selectProducto = document.getElementById('select-producto');
    const btnAgregarItem = document.getElementById('btn-agregar-item');
    const listaProductosVenta = document.getElementById('lista-productos-venta');
    
    let productosEnVenta = [];

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
                window.location.reload();
            } else {
                alert('Error al registrar la venta. Por favor, revisa el stock y los datos.');
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
    // La variable 'ingresosSemana' debe estar definida en index.html antes de cargar main.js
    const ctx = document.getElementById('graficoVentasSemana');
    
    // Verificamos si los datos están disponibles y si el canvas existe
    if (ctx && typeof ingresosSemana !== 'undefined') {
        new Chart(ctx, {
            type: 'bar',
            data: {
                // Usamos las etiquetas (días y fechas) generadas por la función de Flask
                labels: ingresosSemana.labels,
                datasets: [{
                    label: 'Ingresos por día ($)',
                    // Usamos los datos de ingresos calculados por la función de Flask
                    data: ingresosSemana.datos, 
                    backgroundColor: 'rgba(230, 0, 35, 0.7)', // Color Coca-Cola Red con opacidad
                    borderColor: 'rgba(230, 0, 35, 1)',
                    borderWidth: 1,
                    borderRadius: 5,
                    hoverBackgroundColor: 'rgba(178, 0, 27, 1)' // Rojo más oscuro al pasar el ratón
                }]
            },
            options: {
                scales: { 
                    y: { 
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Ingresos ($)'
                        }
                    },
                    x: {
                        grid: { display: false } // Oculta las líneas de la cuadrícula del eje X para mayor limpieza
                    }
                },
                responsive: true,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += '$' + context.parsed.y.toFixed(2);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }
});