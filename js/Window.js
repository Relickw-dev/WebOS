// js/Window.js

export class Window {
    constructor(title, contentElement) {
        this.title = title;
        this.contentElement = contentElement;
        this.init();
    }

    init() {
        // Crează elementele ferestrei
        this.windowEl = document.createElement('div');
        this.windowEl.className = 'window';
        this.windowEl.style.left = `${Math.random() * 200 + 50}px`;
        this.windowEl.style.top = `${Math.random() * 200 + 50}px`;

        const header = document.createElement('div');
        header.className = 'window-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'title';
        titleEl.textContent = this.title;

        const closeBtn = document.createElement('span');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = 'X';
        closeBtn.onclick = () => this.close();

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'window-body';
        body.appendChild(this.contentElement);

        this.windowEl.appendChild(header);
        this.windowEl.appendChild(body);

        // Adaugă logica de drag-and-drop
        this.makeDraggable(header);

        document.getElementById('desktop').appendChild(this.windowEl);
    }

    close() {
        this.windowEl.remove();
    }

    makeDraggable(header) {
        let isDragging = false;
        let offsetX, offsetY;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            // Calculează offset-ul mouse-ului față de colțul ferestrei
            offsetX = e.clientX - this.windowEl.offsetLeft;
            offsetY = e.clientY - this.windowEl.offsetTop;

            // Previne selectarea textului în timpul drag-ului
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            // Poziționează fereastra pe baza poziției mouse-ului
            this.windowEl.style.left = `${e.clientX - offsetX}px`;
            this.windowEl.style.top = `${e.clientY - offsetY}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.userSelect = 'auto';
        });
    }
}