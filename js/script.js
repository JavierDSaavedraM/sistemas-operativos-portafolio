document.addEventListener('DOMContentLoaded', () => {
    // 1. Recuperar el filtro guardado al cargar la página
    // Si no hay nada guardado, usamos 'todo' por defecto
    const filtroGuardado = localStorage.getItem('filtroActual') || 'todo';
    
    // 2. Aplicar el filtro
    filtrarSeccion(filtroGuardado);
});

function filtrarSeccion(filtro) {
    const secciones = document.querySelectorAll('.seccion-contenido');
    const divisores = document.querySelectorAll('.divider');
    const botones = document.querySelectorAll('.menu-btn');

    // --- LÓGICA DE VISIBILIDAD ---
    secciones.forEach(seccion => {
        if (filtro === 'todo') {
            // Si el filtro es "todo", quitamos la clase hidden a todos
            seccion.classList.remove('hidden');
        } else {
            // Si es un filtro específico (ej. 'parcial1')
            if (seccion.id === filtro) {
                seccion.classList.remove('hidden');
            } else {
                seccion.classList.add('hidden');
            }
        }
    });

    // Controlar los separadores (dividers)
    // Si estamos en modo "todo", mostramos los divisores. Si no, los ocultamos.
    divisores.forEach(div => {
        if (filtro === 'todo') {
            div.style.display = 'block';
        } else {
            div.style.display = 'none';
        }
    });

    // --- ACTUALIZAR BOTONES DEL MENÚ ---
    botones.forEach(btn => {
        btn.classList.remove('active');
        // Verificamos si el onclick del botón contiene el filtro actual
        const onclickTexto = btn.getAttribute('onclick');
        if (onclickTexto && onclickTexto.includes(`'${filtro}'`)) {
            btn.classList.add('active');
        }
    });

    // --- GUARDAR ESTADO ---
    localStorage.setItem('filtroActual', filtro);
    
    // Scroll arriba suavemente
    window.scrollTo({ top: 0, behavior: 'smooth' });
}