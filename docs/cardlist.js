/**
 * Card List Windoid — HyperCode
 * Displays a list of all cards in the stack and allows quick navigation.
 */
export class CardList {
    constructor(app) {
        this.app = app;
        this._el = null;
        this._visible = false;
    }

    init() {
        const el = document.getElementById('cards-windoid');
        this._el = el;
        el.innerHTML = `
      <div class="windoid-title" id="cards-drag">
        <span class="windoid-close" style="float:left;width:11px;height:11px;border:1px solid #000;margin:1px 0 0 0px;cursor:pointer;background:#fff;" title="Close"></span>
        Cards
      </div>
      <div class="cards-list-inner" id="cards-list-container">
        <!-- Card items will be rendered here -->
      </div>`;

        this.app.ui._makeDraggable(el, el.querySelector('#cards-drag'));
        el.querySelector('.windoid-close').addEventListener('click', () => this.hide());
        el.style.display = 'none';

        // Listen for card changes to refresh the list
        // (If we had a formal event system, we'd use it here)
    }

    toggle() {
        if (this._el.style.display === 'none') this.show();
        else this.hide();
    }

    show() {
        this._visible = true;
        this._el.style.display = 'block';
        this.refresh();
        this.app.ui._updateMenuLabels();
    }

    hide() {
        this._visible = false;
        this._el.style.display = 'none';
        this.app.ui._updateMenuLabels();
    }

    refresh() {
        if (!this._el) return;
        const container = this._el.querySelector('#cards-list-container');
        if (!container) return;

        const { cards, currentCardIndex } = this.app.state;
        container.innerHTML = cards.map((card, idx) => `
            <div class="card-list-item ${idx === currentCardIndex ? 'active' : ''}" data-index="${idx}">
                <span class="card-list-num">${idx + 1}.</span>
                <span class="card-list-name">${this._esc(card.name || 'Untitled')}</span>
            </div>
        `).join('');

        container.querySelectorAll('.card-list-item').forEach(el => {
            el.onclick = () => {
                const idx = parseInt(el.dataset.index);
                // Highlight briefly
                el.classList.add('clicking');
                setTimeout(() => {
                    el.classList.remove('clicking');
                    this.app.goToCard(idx + 1);
                    this.refresh(); // Update active state
                }, 150);
            };
        });
    }

    _esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
