function openTab(evt, tabName) {
    // 1. Ocultar todos los elementos con la clase "tab-content"
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].classList.remove("active-tab"); // Usamos clases CSS para controlar la visibilidad
    }

    // 2. Quitar la clase "active" de todos los botones del menú
    tablinks = document.getElementsByClassName("menu-btn");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    // 3. Mostrar la pestaña actual y añadir la clase "active" al botón que se clickeó
    document.getElementById(tabName).classList.add("active-tab");
    evt.currentTarget.classList.add("active");
}