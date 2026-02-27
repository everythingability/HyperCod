/**
 * UI Module — HyperCard PWA
 * Handles: card rendering, object layer, edit mode, selection, flickerless drag/resize,
 * tool windoid (incl. paint tools), menu bar, keyboard shortcuts, image drop.
 */
export class UI {
    constructor(app) {
        this.app = app;
        this._drag = null;   // { type:'move'|'resize', obj, ... }
        this._creating = null;   // rect being drawn for new object
        this._clipboard = null;
    }

    init() {
        this._buildMenuBar();
        this._buildToolWindoid();
        this._buildCardArea();
        this._bindGlobalKeys();
        this.renderCard();
        this.updateToolState();
        if (this.app.state.isPublished) {
            this.toggleTools(false);
        }
    }

    // ── Menu Bar ────────────────────────────────────────────────────────────────
    _buildMenuBar() {
        const bar = document.getElementById('menu-bar');
        bar.innerHTML = '';
        const menus = {
            '🍎': [
                {
                    label: 'About HyperCod', action: () => {
                        const s = document.getElementById('splash');
                        s.classList.add('about-mode');
                        const close = () => s.classList.remove('about-mode');
                        s.onclick = close;
                        s.querySelector('.splash-close').onclick = (e) => { e.stopPropagation(); close(); };
                    }
                },
                null,
                {
                    label: 'Reload & Clear Cache', action: () => {
                        if (!confirm('Reload and clear cache?')) return;
                        // Unregister service workers and clear caches, then reload with a cache-busting param
                        navigator.serviceWorker.getRegistrations().then(regs => {
                            for (let r of regs) r.unregister();
                            caches.keys().then(keys => {
                                for (let k of keys) caches.delete(k);
                                try {
                                    // Clear runtime edit override so reload returns to published view
                                    localStorage.removeItem('HC_EDIT');
                                } catch (e) { }
                                const url = new URL(location.href);
                                url.searchParams.set('_ts', Date.now().toString());
                                // Force full navigation to bypass any stubborn cache
                                location.href = url.toString();
                            });
                        });
                    }
                },
                {
                    label: 'Toggle Authoring Mode', action: () => {
                        const cur = localStorage.getItem('HC_EDIT') === '1';
                        if (cur) {
                            if (!confirm('Disable authoring (edit) mode and reload?')) return;
                            localStorage.removeItem('HC_EDIT');
                        } else {
                            if (!confirm('Enable authoring (edit) mode and reload?')) return;
                            localStorage.setItem('HC_EDIT', '1');
                        }
                        const url = new URL(location.href);
                        url.searchParams.set('_ts', Date.now().toString());
                        url.searchParams.set('edit', localStorage.getItem('HC_EDIT') === '1' ? '1' : '0');
                        location.href = url.toString();
                    }
                }
            ],
            'File': [
                { label: 'New Stack', action: () => this._newStack() },
                { label: 'Export Stack JSON', action: () => this._exportStack() },
                { label: 'Import Stack JSON…', action: () => this._importStack() },
                { label: 'Export as Website...', action: () => this._exportAsWebsite() },
                null,
                { label: 'Stack Info…', action: () => this.app.dialogs.openStackInfo() },
            ],
            'Edit': [
                { label: 'Cut', action: () => this._cutObject(), key: '⌘X' },
                { label: 'Copy', action: () => this._copyObject(), key: '⌘C' },
                { label: 'Paste', action: () => this._pasteObject(), key: '⌘V' },
                null,
                { label: 'Delete Object', action: () => this._deleteSelected() },
                null,
                { label: 'Clear Paint Layer', action: () => this.app.paint?.clearCard() },
                null,
                { label: 'Edit Link...', action: () => this._linkSelection(), key: '⌘K' },
            ],
            'Go': [
                { label: 'Back', action: () => this.app.goToCard('back'), key: '⌘[' },
                null,
                { label: 'First Card', action: () => this.app.goToCard('first'), key: '⌘1' },
                { label: 'Prev Card', action: () => this.app.goToCard('prev'), key: '←' },
                { label: 'Next Card', action: () => this.app.goToCard('next'), key: '→' },
                { label: 'Last Card', action: () => this.app.goToCard('last'), key: '⌘4' },
                null,
                { label: 'Find…', action: () => this._findCard(), key: '⌘F' },
            ],
            'Objects': [
                { label: 'New Button', action: () => this._createObjectCentered('button') },
                { label: 'New Field', action: () => this._createObjectCentered('field') },
                { label: 'New Image...', action: () => this._pickImage() },
                { label: 'New Audio...', action: () => this._pickAudio() },
                { label: 'New Embed...', action: () => this._createObjectCentered('embed') },
                { label: 'New Emoji', action: () => this._createObjectCentered('emoji') },
                null,
                { label: 'New Card', action: () => this.app.addCard(), key: '⌘N' },
                { label: 'Duplicate Card', action: () => this.app.duplicateCard() },
                { label: 'Delete Card', action: () => this.app.deleteCurrentCard() },

                { label: 'Card Info…', action: () => this.app.dialogs.openCardInfo() },
                { label: 'Background Info…', action: () => this.app.dialogs.openBackgroundInfo() },
                null,
                { label: 'Bring Forward', action: () => this._reorder(1) },
                { label: 'Send Backward', action: () => this._reorder(-1) },
            ],
            'Tools': [
                { id: 'menu-tools-toggle', label: 'Hide Tools', action: () => this.toggleTools() },
                null,
                { label: 'Browse', action: () => this.app.setTool('browse'), key: '⌘B' },
                { label: 'Pointer', action: () => this.app.setTool('pointer'), key: '⌘E' },
                null,
                { id: 'menu-msgbox-toggle', label: 'Show Message Box', action: () => this.app.messagebox.toggle(), key: '⌘M' },
                { id: 'menu-cards-toggle', label: 'Show Cards', action: () => this.app.cardlist.toggle(), key: '⌘L' },
            ],
            'Help': [
                { id: 'menu-help-toggle', label: 'Show HyperCode Help', action: () => this.app.help.toggle(), key: '⌘/' },
                { label: 'HyperCod Language Reference', action: () => window.open('HyperCod Reference.html', '_blank') },
                { label: 'Javascript Reference', action: () => window.open('Javascript Reference.html', '_blank') },
                { label: 'All About HyperCOD', action: () => window.open('https://everythingability.github.io/HyperCod/docs/', '_blank') },
            ],
        };

        if (this.app.state.isPublished) {
            // Remove creator/editing menus
            delete menus['Objects'];
            delete menus['Tools'];

            // Filter File menu: remove export/import/stack info
            menus['File'] = menus['File'].filter(m => m && !['New Stack', 'Export Stack JSON', 'Import Stack JSON…', 'Export as Website...', 'Stack Info…'].includes(m.label));

            // Filter Help menu: remove the technical "HyperCode Help" toggle but keep documentation and the demo link
            menus['Help'] = (menus['Help'] || []).filter(m => m && m.label !== 'Show HyperCode Help');

            // Filter Edit menu - remove everything
            menus['Edit'] = [];

            // Clean up empty menus 
            for (const key of Object.keys(menus)) {
                if (!menus[key] || menus[key].length === 0) delete menus[key];
                else {
                    // Remove leading/trailing nulls in case we filtered everything
                    while (menus[key].length > 0 && menus[key][0] === null) menus[key].shift();
                    while (menus[key].length > 0 && menus[key][menus[key].length - 1] === null) menus[key].pop();
                }
            }
        }

        for (const [title, items] of Object.entries(menus)) {
            const wrap = document.createElement('div'); wrap.className = 'menu-item';
            const lbl = document.createElement('span'); lbl.textContent = title;
            wrap.appendChild(lbl);

            if (items.length) {
                const drop = document.createElement('div'); drop.className = 'menu-dropdown';
                for (const item of items) {
                    if (!item) { const sep = document.createElement('div'); sep.className = 'menu-sep'; drop.appendChild(sep); continue; }
                    const mi = document.createElement('div');
                    mi.className = 'menu-option';
                    if (item.id) mi.id = item.id;
                    mi.innerHTML = `<span>${item.label}</span>${item.key ? `<span class="menu-key">${item.key}</span>` : ''}`;
                    mi.addEventListener('click', () => { this._closeMenus(); item.action(); });
                    drop.appendChild(mi);
                }
                wrap.appendChild(drop);
                lbl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const open = wrap.classList.contains('open');
                    this._closeMenus();
                    if (!open) {
                        wrap.classList.add('open');
                        this._updateMenuLabels();
                    }
                });
            }
            bar.appendChild(wrap);
        }
        document.addEventListener('click', () => this._closeMenus());

        const status = document.createElement('div'); status.id = 'status-bar';
        status.innerHTML = '<span id="card-counter">Card 1 of 1</span>';
        bar.appendChild(status);
    }

    _closeMenus() { document.querySelectorAll('.menu-item.open').forEach(el => el.classList.remove('open')); }

    updateCardCounter() {
        const el = document.getElementById('card-counter');
        if (el && this.app.state.stack) el.textContent = `Card ${this.app.state.currentCardIndex + 1} of ${this.app.state.cards.length}`;
    }

    // ── Tool Windoid (with paint tools) ─────────────────────────────────────────
    _buildToolWindoid() {
        const w = document.getElementById('tool-windoid');
        w.innerHTML = `
      <div class="windoid-title" id="tool-windoid-drag">
        <span class="windoid-close" style="float:left;width:11px;height:11px;border:1px solid #000;margin:1px 0 0 0px;cursor:pointer;background:#fff;" title="Close"></span>
        Tools
      </div>
      <div class="tool-section">
        <div class="tool-grid main-tools">
          <button class="tool-btn large" data-tool="browse"  title="Browse">☞</button>
          <button class="tool-btn large" data-tool="pointer" title="Pointer (Edit)">↖</button>
          <button class="tool-btn" data-tool="button"  title="New Button">⬜</button>
          <button class="tool-btn" data-tool="field"   title="New Field">📝</button>
          <button class="tool-btn" data-tool="image"   title="Add Image">🖼</button>
          <button class="tool-btn" data-tool="audio"   title="Add Audio">🔊</button>
          <button class="tool-btn" data-tool="embed"   title="Add Embed">🌐</button>
          <button class="tool-btn" data-tool="emoji"   title="Add Emoji">😀</button>
        </div>
      </div>
      <div class="windoid-section-label">PAINT</div>
      <div class="tool-section">
        <div class="tool-grid paint-tools">
          <button class="tool-btn" data-tool="pencil"  title="Pencil">✏️</button>
          <button class="tool-btn" data-tool="spray"   title="Spray Can">💨</button>
          <button class="tool-btn" data-tool="fill"    title="Flood Fill">🪣</button>
          <button class="tool-btn" data-tool="eraser"  title="Eraser">⬜</button>
        </div>
        <div class="tool-grid shape-tools">
          <button class="tool-btn small" data-tool="line"    title="Line">╱</button>
          <button class="tool-btn small" data-tool="rect"    title="Rectangle">▭</button>
          <button class="tool-btn small" data-tool="ellipse" title="Ellipse">◯</button>
        </div>
      </div>
      <div class="paint-controls">
        <div class="paint-row-stacked">
          <label class="paint-lbl">Fill:</label>
          <input id="paint-color" type="color" value="#000000">
        </div>
        <div class="paint-row-stacked">
          <label class="paint-lbl">Back:</label>
          <input id="paint-bgcolor" type="color" value="#ffffff">
        </div>
        <div class="paint-row-stacked">
          <label class="paint-lbl" title="Fill Pattern">Pat:</label>
          <select id="paint-texture">
            <option value="solid">Solid</option>
            <option value="checker">Checker</option>
            <option value="hlines">H-Lines</option>
            <option value="vlines">V-Lines</option>
            <option value="stripes">Stripes</option>
            <option value="dots">Dots</option>
            <option value="crosshatch">Crosshatch</option>
          </select>
        </div>
        <div class="paint-row-stacked">
          <label class="paint-lbl" title="Pencil/Brush Size">Size:</label>
          <input id="paint-size" type="range" min="1" max="30" value="6">
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-top:4px; padding-left:2px;">
           <div id="paint-preview" style="width:24px;height:24px;border:1px solid #000;background:#000;flex-shrink:0;"></div>
           <div style="font-size:8px; color:#666; line-height:1.1;">Brush & Fill<br>Preview <span id="paint-size-val">6</span></div>
        </div>
      </div>
      <div class="tool-mode-label" id="tool-mode-label">BROWSE</div>`;

        w.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => this.app.setTool(btn.dataset.tool));
        });
        w.querySelector('.windoid-close').addEventListener('click', () => this.toggleTools(false));

        // Paint controls
        const colorPicker = document.getElementById('paint-color');
        const bgColorPicker = document.getElementById('paint-bgcolor');
        const sizeSlider = document.getElementById('paint-size');
        const sizeVal = document.getElementById('paint-size-val');
        const texSel = document.getElementById('paint-texture');
        const preview = document.getElementById('paint-preview');

        const updatePreview = () => {
            if (!preview) return;
            preview.style.backgroundColor = 'transparent';
            preview.style.backgroundImage = `url(${this.app.paint.getPreviewURL()})`;
            preview.style.backgroundRepeat = 'repeat';
        };

        colorPicker.addEventListener('input', () => {
            this.app.paint.color = colorPicker.value;
            updatePreview();
        });
        if (bgColorPicker) {
            bgColorPicker.addEventListener('input', () => {
                this.app.paint.bgColor = bgColorPicker.value;
                updatePreview();
            });
        }
        sizeSlider.addEventListener('input', () => {
            this.app.paint.size = +sizeSlider.value;
            if (sizeVal) sizeVal.textContent = sizeSlider.value;
        });
        texSel.addEventListener('change', () => {
            this.app.paint.texture = texSel.value;
            updatePreview();
        });
        updatePreview();

        this._makeDraggable(w, document.getElementById('tool-windoid-drag'));
    }

    updateToolState() {
        const { tool } = this.app.state;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        const label = document.getElementById('tool-mode-label');
        const PAINT_TOOLS = ['pencil', 'spray', 'fill', 'eraser', 'line', 'rect', 'ellipse'];
        if (label) label.textContent = tool === 'browse' ? 'BROWSE' : PAINT_TOOLS.includes(tool) ? 'PAINT' : 'EDIT';

        const canvas = document.getElementById('card-canvas');
        if (!canvas) return;
        const cursors = {
            browse: 'default', pointer: 'default', button: 'crosshair', field: 'crosshair',
            image: 'crosshair', audio: 'crosshair', embed: 'crosshair', emoji: 'crosshair',
            pencil: 'crosshair', spray: 'crosshair', fill: 'cell', eraser: 'cell', line: 'crosshair',
            rect: 'crosshair', ellipse: 'crosshair'
        };
        canvas.style.cursor = cursors[tool] || 'default';
        canvas.classList.toggle('edit-mode', tool !== 'browse' && !PAINT_TOOLS.includes(tool));
        document.body.classList.toggle('edit-mode', tool !== 'browse');
    }

    // ── Card Canvas ──────────────────────────────────────────────────────────────
    _buildCardArea() {
        const canvas = document.getElementById('card-canvas');
        canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this._onCanvasMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this._onCanvasMouseUp(e));
        canvas.addEventListener('dblclick', (e) => this._onCanvasDblClick(e));
        canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('drag-over'); });
        canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over'));
        canvas.addEventListener('drop', (e) => this._onDrop(e));
    }

    renderCard() {
        const canvas = document.getElementById('card-canvas');
        if (!canvas) return;
        const { currentCard, currentBackground, stack } = this.app.state;
        if (!currentCard || !stack) return;

        const { width, height } = stack.cardSize;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        // Apply Stack Style
        canvas.classList.remove('style-roundrect', 'style-shadow', 'style-borderless');
        if (stack.style && stack.style !== 'rectangle') {
            canvas.classList.add(`style-${stack.style}`);
        }

        // Apply Backdrop settings
        const container = document.getElementById('app-container');
        if (container) {
            container.style.setProperty('--backdrop-color', stack.backdropColor || '#e0e0e0');
            container.style.setProperty('--pattern-color', stack.patternColor || '#d0d0d0');
            container.className = ''; // Reset patterns
            if (stack.pattern && stack.pattern !== 'none') {
                container.classList.add(`pattern-${stack.pattern}`);
            }
        }

        let bgColor = stack.backgroundColor || '#ffffff';
        if (stack.isTransparent) bgColor = 'transparent';

        if (currentBackground && !currentBackground.isTransparent && currentBackground.backgroundColor) {
            bgColor = currentBackground.backgroundColor;
        }

        if (!currentCard.isTransparent && currentCard.backgroundColor) {
            bgColor = currentCard.backgroundColor;
        }

        canvas.style.backgroundColor = bgColor;
        const bgImg = currentCard.backgroundImage || currentBackground?.backgroundImage || stack.backgroundImage;
        canvas.style.backgroundImage = bgImg ? `url("${bgImg}")` : 'none';
        canvas.style.backgroundSize = 'cover';
        canvas.style.backgroundPosition = 'center';
        canvas.style.backgroundRepeat = 'no-repeat';

        // Remove only object elements — preserve paint-canvas and handles
        canvas.querySelectorAll('.hc-obj').forEach(el => el.remove());

        const all = [
            ...(currentBackground?.objects || []),
            ...(currentCard.objects || []),
        ];
        all.forEach(obj => canvas.appendChild(this._buildObjEl(obj)));

        this.updateCardCounter();
        this._restoreSelection();

        if (this.app.state.nextTransition) {
            const effect = this.app.state.nextTransition;
            this.app.state.nextTransition = null;
            const animClass = `hc-anim-${effect}`;
            canvas.classList.remove(animClass);
            void canvas.offsetWidth; // trigger reflow
            canvas.classList.add(animClass);
            canvas.addEventListener('animationend', () => canvas.classList.remove(animClass), { once: true });
        }
    }

    _buildObjEl(obj) {
        const el = document.createElement('div');
        el.className = 'hc-obj';

        const cardName = this.app.state.currentCard?.name || '';
        const isHiddenOnHome = obj.layer === 'background' && obj.hideOnHome && cardName.toLowerCase() === 'home';
        if (!obj.visible || isHiddenOnHome) el.classList.add('hc-invisible');

        el.dataset.id = obj.id; el.dataset.type = obj.type;
        const { x, y, width, height } = obj.rect;
        Object.assign(el.style, {
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
            position: 'absolute',
            transform: obj.rotation ? `rotate(${obj.rotation}deg)` : 'none'
        });

        if (obj.type === 'button') this._renderButton(el, obj);
        else if (obj.type === 'field') this._renderField(el, obj);
        else if (obj.type === 'image') this._renderImage(el, obj);
        else if (obj.type === 'audio') this._renderAudio(el, obj);
        else if (obj.type === 'embed') this._renderEmbed(el, obj);
        else if (obj.type === 'emoji') this._renderEmoji(el, obj);

        el.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (this.app.state.tool === 'browse') return;
            if (this.app.state.tool === 'pointer') this._startMove(e, obj, el);
        });
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (this.app.state.tool !== 'browse') this.app.dialogs.openObjectInfo(obj);
        });

        // Browse-mode script click for non-button objects (fields, images)
        if (this.app.state.tool === 'browse' && obj.type !== 'button') {
            el.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (obj.script) await this.app.handleObjectEvent('mouseUp', obj.id);
            });
            if (obj.script) el.style.cursor = 'pointer';
        }

        // Add hover events for all objects in browse mode
        if (this.app.state.tool === 'browse') {
            el.addEventListener('mouseenter', async () => {
                if (obj.script) await this.app.handleObjectEvent('mouseEnter', obj.id);
            });
            el.addEventListener('mouseleave', async () => {
                if (obj.script) await this.app.handleObjectEvent('mouseLeave', obj.id);
            });
        }

        return el;
    }

    _renderButton(el, obj) {
        Object.assign(el.style, {
            fontSize: `${obj.fontSize}px`, fontFamily: obj.fontFamily, color: obj.textColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
            userSelect: 'none', cursor: this.app.state.tool === 'browse' ? 'pointer' : 'default'
        });

        const styleMap = {
            roundrect: `background:${obj.fillColor};border:2px solid #000;border-radius:8px;`,
            rectangle: `background:${obj.fillColor};border:2px solid #000;`,
            shadow: `background:${obj.fillColor};border:2px solid #000;box-shadow:3px 3px 0 #000;`,
            opaque: `background:${obj.fillColor};border:1px solid #888;`,
            transparent: `background:transparent;border:none;`,
            borderless: `background:transparent;border:none;`,
            oval: `background:${obj.fillColor};border:2px solid #000;border-radius:50%;`,
            checkbox: `background:transparent;border:none;`,
            radio: `background:transparent;border:none;`,
        };
        el.style.cssText += (styleMap[obj.style] || styleMap.roundrect);

        if (obj.style === 'checkbox' || obj.style === 'radio') {
            const inp = document.createElement('input'); inp.type = obj.style; inp.id = `hci-${obj.id}`;
            const lbl = document.createElement('label'); lbl.htmlFor = inp.id; lbl.textContent = ` ${obj.title || obj.name}`; lbl.style.cursor = 'pointer';
            el.appendChild(inp); el.appendChild(lbl);
        } else { el.textContent = obj.title || obj.name; }

        if (this.app.state.tool === 'browse' && obj.enabled) {
            el.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (obj.autoHilite) {
                    el.classList.add('hc-hiliting');
                    setTimeout(() => {
                        el.classList.remove('hc-hiliting');
                    }, 120);
                }
                await this.app.handleObjectEvent('mouseUp', obj.id);
            });
            el.addEventListener('mousedown', (e) => { e.stopPropagation(); this.app.handleObjectEvent('mouseDown', obj.id); });
        }
    }

    _renderField(el, obj) {
        el.style.boxSizing = 'border-box';
        const styleMap = {
            rectangle: `border:2px solid #000;background:${obj.fillColor};`,
            shadow: `border:2px solid #000;background:${obj.fillColor};box-shadow:3px 3px 0 #000;`,
            opaque: `border:1px solid #888;background:${obj.fillColor};`,
            transparent: `border:none;background:transparent;`,
            borderless: `border:none;background:transparent;`,
            scrolling: `border:2px solid #000;background:${obj.fillColor};overflow:auto;`,
        };
        el.style.cssText += (styleMap[obj.style] || styleMap.rectangle);
        el.style.cssText += `;font-size:${obj.fontSize}px;font-family:${obj.fontFamily};color:${obj.textColor};padding:4px;text-align:${obj.textAlign || 'left'};`;
        // Preserve newline rendering inside fields
        el.style.whiteSpace = 'pre-wrap';

        if (obj.textStyle) {
            if (obj.textStyle.includes('bold')) el.style.fontWeight = 'bold';
            if (obj.textStyle.includes('italic')) el.style.fontStyle = 'italic';
        }

        if (this.app.state.tool === 'browse') {
            if (obj.allowLinks) {
                el.innerHTML = this._cleanHtml(obj.content || '', true);
                el.querySelectorAll('a').forEach(a => {
                    a.style.cursor = 'pointer';
                    a.onclick = (e) => {
                        e.stopPropagation(); e.preventDefault();
                        window.open(a.getAttribute('href'), '_blank');
                    };
                });
            } else { el.textContent = this._cleanHtml(obj.content || '', false); }

            if (obj.editable && !obj.lockText) {
                el.contentEditable = 'true'; el.style.cursor = 'text'; el.style.outline = 'none';
                el.addEventListener('input', () => {
                    obj.content = this._cleanHtml(el.innerHTML, obj.allowLinks);
                    this.app.scheduleAutoSave();
                });
                el.addEventListener('click', e => e.stopPropagation());
            } else {
                el.contentEditable = 'false';
                el.style.cursor = 'default';
                if (!obj.allowLinks) el.addEventListener('click', e => e.stopPropagation());
            }
        } else {
            // Edit mode: show cleaned text (never show raw HTML tags or &nbsp;)
            el.textContent = this._cleanHtml(obj.content || '', false);
        }
    }

    _cleanHtml(html, preserveLinks) {
        if (!html) return '';
        let s = html
            .replace(/<div[^>]*><br\s*[\/]?><\/div>/gi, '\n')
            .replace(/<div[^>]*>/gi, '\n')
            .replace(/<\/div>/gi, '')
            .replace(/<p[^>]*>/gi, '\n')
            .replace(/<\/p>/gi, '')
            .replace(/<br\s*[\/]?/gi, '\n')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&amp;/gi, '&');

        if (preserveLinks) {
            // Remove all tags except <a>
            s = s.replace(/<(?!a\s|\/a>)[^>]+>/gi, '');
        } else {
            // Remove all tags
            s = s.replace(/<[^>]+>/gi, '');
        }

        return s;
    }

    _renderImage(el, obj) {
        el.style.overflow = 'hidden'; el.style.border = '1px solid transparent';
        if (obj.src) {
            const img = document.createElement('img');
            img.src = obj.src; img.alt = obj.alt || '';
            img.style.cssText = `width:100%;height:100%;object-fit:${obj.fit || 'cover'};display:block;`;
            el.appendChild(img);
        } else {
            Object.assign(el.style, { border: '2px dashed #aaa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '11px' });
            el.textContent = 'Drop image here';
        }
    }

    _renderAudio(el, obj) {
        el.style.overflow = 'hidden';
        if (obj.src) {
            const audio = document.createElement('audio');
            audio.src = obj.src;
            if (obj.controls) audio.controls = true;
            if (obj.loop) audio.loop = true;
            audio.style.width = '100%';

            if (obj.autoplay && this.app.state.tool === 'browse') {
                audio.autoplay = true;
                // Explicitly call play() as some browsers block dynamic autoplay attributes
                setTimeout(() => {
                    audio.play().catch(e => console.warn("Autoplay blocked by browser:", e));
                }, 50);
            }

            // Prevent interaction in edit mode so it can be dragged
            if (this.app.state.tool !== 'browse') {
                audio.style.pointerEvents = 'none';
            }
            el.appendChild(audio);
        } else {
            Object.assign(el.style, { border: '2px dashed #aaa', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '12px' });
            el.textContent = '🎵 No Audio File';
        }
    }

    _renderEmbed(el, obj) {
        el.style.overflow = 'hidden';
        Object.assign(el.style, { border: '1px solid #ccc', background: '#fff' });

        const wrapper = document.createElement('div');
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        // Critical: disable pointer events on the wrapper when not in browse mode so drag/drop works
        if (this.app.state.tool !== 'browse') {
            wrapper.style.pointerEvents = 'none';
            // Also put a semi-transparent overlay to make it clear it's inactive
            const overlay = document.createElement('div');
            Object.assign(overlay.style, { position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.3)', zIndex: 10 });
            el.appendChild(overlay);
        }

        if (obj.htmlCode) {
            wrapper.innerHTML = obj.htmlCode;
        } else {
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'center';
            wrapper.style.color = '#aaa';
            wrapper.textContent = 'Add Embed Code';
        }
        el.appendChild(wrapper);
    }

    _renderEmoji(el, obj) {
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.overflow = 'hidden';
        el.style.userSelect = 'none';

        // Font size calculation to fill the box
        const size = Math.min(obj.rect.width, obj.rect.height) * 0.85;
        el.style.fontSize = `${size}px`;
        el.textContent = obj.emoji || '🚀';
    }


    // ── Selection & handles ──────────────────────────────────────────────────────
    _restoreSelection() {
        document.querySelectorAll('.hc-handle,.hc-selection-outline').forEach(el => el.remove());
        const sel = this.app.state.selectedObject;
        if (!sel) return;
        const el = document.querySelector(`.hc-obj[data-id="${sel.id}"]`);
        if (el) this._showHandles(sel);
    }

    selectObject(obj) {
        this.app.state.selectedObject = obj;
        document.querySelectorAll('.hc-handle,.hc-selection-outline').forEach(el => el.remove());
        if (obj) this._showHandles(obj);
    }

    _showHandles(obj) {
        const host = document.getElementById('card-canvas');
        const outline = document.createElement('div');
        outline.className = 'hc-selection-outline';
        Object.assign(outline.style, {
            position: 'absolute', left: (obj.rect.x - 2) + 'px', top: (obj.rect.y - 2) + 'px',
            width: (obj.rect.width + 4) + 'px', height: (obj.rect.height + 4) + 'px',
            border: '2px dashed #0060ff', pointerEvents: 'none', zIndex: 100, boxSizing: 'content-box'
        });
        host.appendChild(outline);

        const handle = document.createElement('div');
        handle.className = 'hc-handle';
        Object.assign(handle.style, {
            position: 'absolute',
            left: (obj.rect.x + obj.rect.width - 5) + 'px', top: (obj.rect.y + obj.rect.height - 5) + 'px',
            width: '9px', height: '9px', background: '#0060ff', border: '1px solid #fff',
            cursor: 'nwse-resize', zIndex: 101, boxSizing: 'content-box'
        });
        handle.addEventListener('mousedown', (e) => { e.stopPropagation(); this._startResize(e, obj); });
        host.appendChild(handle);
    }

    // ── Flickerless drag/resize ──────────────────────────────────────────────────
    _canvasOffset(e) {
        const r = document.getElementById('card-canvas').getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _startMove(e, obj, el) {
        if (this.app.state.tool !== 'pointer') return;
        this.selectObject(obj);
        const off = this._canvasOffset(e);
        this._drag = {
            type: 'move', obj, el,
            startX: off.x - obj.rect.x, startY: off.y - obj.rect.y
        };
    }

    _startResize(e, obj) {
        const off = this._canvasOffset(e);
        this._drag = {
            type: 'resize', obj, el: document.querySelector(`.hc-obj[data-id="${obj.id}"]`),
            startX: off.x, startY: off.y, origW: obj.rect.width, origH: obj.rect.height
        };
    }

    _onCanvasMouseDown(e) {
        const { tool } = this.app.state;
        if (tool === 'browse' || ['pencil', 'spray', 'fill', 'eraser', 'line', 'rect', 'ellipse'].includes(tool)) return;
        if (tool === 'pointer') { this.selectObject(null); document.querySelectorAll('.hc-handle,.hc-selection-outline').forEach(el => el.remove()); return; }

        // Draw new object
        if (['button', 'field', 'image', 'audio', 'embed', 'emoji'].includes(tool)) {
            const off = this._canvasOffset(e);
            this._creating = { x: off.x, y: off.y, w: 0, h: 0, tool };
            let ghost = document.getElementById('hc-ghost');
            if (!ghost) {
                ghost = document.createElement('div'); ghost.id = 'hc-ghost';
                document.getElementById('card-canvas').appendChild(ghost);
            }
            Object.assign(ghost.style, {
                position: 'absolute', border: '2px dashed #0060ff', background: 'rgba(0,96,255,0.08)',
                left: off.x + 'px', top: off.y + 'px', width: '0', height: '0', zIndex: 200, pointerEvents: 'none'
            });
        }
    }

    _onCanvasMouseMove(e) {
        // Drag — update DOM directly, NO full re-render (prevents flicker)
        if (this._drag) {
            const off = this._canvasOffset(e);
            const { type, obj, el } = this._drag;
            const outline = document.querySelector('.hc-selection-outline');
            const handle = document.querySelector('.hc-handle');

            if (type === 'move') {
                const newX = Math.max(0, Math.round(off.x - this._drag.startX));
                const newY = Math.max(0, Math.round(off.y - this._drag.startY));
                if (newX !== obj.rect.x || newY !== obj.rect.y) this._drag.moved = true;
                obj.rect.x = newX;
                obj.rect.y = newY;
                if (el) { el.style.left = obj.rect.x + 'px'; el.style.top = obj.rect.y + 'px'; }
                if (outline) { outline.style.left = (obj.rect.x - 2) + 'px'; outline.style.top = (obj.rect.y - 2) + 'px'; }
                if (handle) { handle.style.left = (obj.rect.x + obj.rect.width - 5) + 'px'; handle.style.top = (obj.rect.y + obj.rect.height - 5) + 'px'; }
            } else if (type === 'resize') {
                const newW = Math.max(20, this._drag.origW + Math.round(off.x - this._drag.startX));
                const newH = Math.max(16, this._drag.origH + Math.round(off.y - this._drag.startY));
                if (newW !== obj.rect.width || newH !== obj.rect.height) this._drag.moved = true;
                obj.rect.width = newW;
                obj.rect.height = newH;
                if (el) { el.style.width = obj.rect.width + 'px'; el.style.height = obj.rect.height + 'px'; }
                if (outline) { outline.style.width = (obj.rect.width + 4) + 'px'; outline.style.height = (obj.rect.height + 4) + 'px'; }
                if (handle) { handle.style.left = (obj.rect.x + obj.rect.width - 5) + 'px'; handle.style.top = (obj.rect.y + obj.rect.height - 5) + 'px'; }
            }
            this.app.scheduleAutoSave();
            return;
        }

        // Drawing new object ghost
        if (this._creating) {
            const off = this._canvasOffset(e);
            const { x, y } = this._creating;
            const w = off.x - x, h = off.y - y;
            this._creating.w = w; this._creating.h = h;
            const ghost = document.getElementById('hc-ghost');
            if (ghost) Object.assign(ghost.style, {
                left: (w < 0 ? off.x : x) + 'px', top: (h < 0 ? off.y : y) + 'px', width: Math.abs(w) + 'px', height: Math.abs(h) + 'px'
            });
        }
    }

    _onCanvasMouseUp(e) {
        if (this._drag) {
            const moved = this._drag.moved;
            this._drag = null;
            if (moved) this.renderCard(); // Only re-render if we actually moved/resized
            this.app.scheduleAutoSave();
            return;
        }
        if (this._creating) {
            const { x, y, w, h, tool } = this._creating;
            this._creating = null;
            const defW = (tool === 'embed') ? 560 : tool === 'emoji' ? 80 : 100;
            const defH = (tool === 'embed') ? 315 : tool === 'emoji' ? 80 : 36;
            document.getElementById('hc-ghost')?.remove();
            const rect = { x: w < 0 ? x + w : x, y: h < 0 ? y + h : y, width: Math.abs(w) || defW, height: Math.abs(h) || defH };
            if (rect.width > 5 || rect.height > 5) {
                const obj = this.app.addObject(tool, rect);
                if (obj) { this.selectObject(obj); this.app.dialogs.openObjectInfo(obj); }
            }
        }
    }

    _onCanvasDblClick(e) {
        if (this.app.state.isPublished) return;
        const PAINT = ['pencil', 'spray', 'fill', 'eraser', 'line', 'rect', 'ellipse'];
        if (!PAINT.includes(this.app.state.tool) && this.app.state.tool !== 'browse')
            this.app.dialogs.openCardInfo();
    }

    // ── Image drag-and-drop ─────────────────────────────────────────────────────
    _onDrop(e) {
        e.preventDefault();
        if (this.app.state.isPublished) return;
        document.getElementById('card-canvas').classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (!file) return;

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const off = this._canvasOffset(e);
                const rect = { x: off.x - 100, y: off.y - 75, width: 200, height: 150 };
                this.app.dialogs.openDitherDialog(ev.target.result, (finalSrc) => {
                    this._addImageWithDither(finalSrc, rect, file.name);
                });
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('audio/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const off = this._canvasOffset(e);
                const rect = { x: off.x - 125, y: off.y - 25, width: 250, height: 50 };
                this._addAudioFile(ev.target.result, rect, file.name);
            };
            reader.readAsDataURL(file);
        }
    }

    _pickImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const rect = { x: 100, y: 100, width: 200, height: 150 };
                this.app.dialogs.openDitherDialog(ev.target.result, (finalSrc) => {
                    this._addImageWithDither(finalSrc, rect, file.name);
                });
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    _addImageWithDither(src, rect, alt) {
        this.app.addObject('image', rect);
        const objs = this.app.state.currentCard.objects;
        const obj = objs[objs.length - 1];
        obj.src = src;
        obj.alt = alt || 'Imported Image';
        this.renderCard();
        // After adding an image, switch to edit (pointer) tool and select the new object
        this.selectObject(obj);
        this.app.setTool('pointer');
        this.app.scheduleAutoSave();
    }

    _pickAudio() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const rect = { x: 100, y: 100, width: 250, height: 50 };
                this._addAudioFile(ev.target.result, rect, file.name);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    _addAudioFile(src, rect, name) {
        this.app.addObject('audio', rect);
        const objs = this.app.state.currentCard.objects;
        const obj = objs[objs.length - 1];
        obj.src = src;
        obj.name = name || 'Imported Audio';
        this.renderCard();
        // After adding audio, switch to edit (pointer) tool and select the new object
        this.selectObject(obj);
        this.app.setTool('pointer');
        this.app.scheduleAutoSave();
    }

    // ── Keyboard shortcuts ───────────────────────────────────────────────────────
    _bindGlobalKeys() {
        document.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            // Allow Command shortcuts like ⌘L even when typing in a field
            if ((tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) && !(e.metaKey || e.ctrlKey)) return;

            // With Cmd/Ctrl
            if (e.metaKey || e.ctrlKey) {
                // Determine if we should allow the default browser action (e.g. for copy/paste in inputs)
                const isEntryField = (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable);
                const isCopyPasteKey = ['c', 'C', 'v', 'V', 'x', 'X', 'a', 'A'].includes(e.key);

                // If it's a copy/paste key in an input field, let the browser handle it
                if (isEntryField && isCopyPasteKey) return;

                switch (e.key) {
                    case '1': e.preventDefault(); this.app.goToCard('first'); return;
                    case '4': e.preventDefault(); this.app.goToCard('last'); return;
                    case 'm': case 'M': e.preventDefault(); this.app.messagebox.toggle(); return;
                    case '/': case '?': e.preventDefault(); this.app.help.toggle(); return;
                    case 'k': case 'K': e.preventDefault(); this._linkSelection(); return;
                    case 'b': case 'B': e.preventDefault(); this.app.setTool('browse'); return;
                    case 'e': case 'E':
                        if (this.app.state.isPublished) return;
                        e.preventDefault(); this.app.setTool('pointer'); return;
                    case 'x': case 'X':
                        if (this.app.state.isPublished) return;
                        e.preventDefault(); this._cutObject(); return;
                    case 'c': case 'C':
                        if (this.app.state.isPublished) return;
                        e.preventDefault(); this._copyObject(); return;
                    case 'v': case 'V':
                        if (this.app.state.isPublished) return;
                        e.preventDefault(); this._pasteObject(); return;
                    case '[': e.preventDefault(); this.app.goToCard('back'); return;
                    case 'n': case 'N':
                        if (this.app.state.isPublished) return;
                        e.preventDefault(); this.app.addCard(); return;
                    case 'l': case 'L': e.preventDefault(); this.app.cardlist.toggle(); return;
                }
            }

            // Plain arrow keys — always navigate cards
            if (!e.metaKey && !e.ctrlKey && !e.altKey) {
                if (e.key === 'ArrowRight') { e.preventDefault(); this.app.goToCard('next'); return; }
                if (e.key === 'ArrowLeft') { e.preventDefault(); this.app.goToCard('prev'); return; }
            }

            // Delete selected object in edit mode
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.app.state.mode === 'edit' && this.app.state.selectedObject) {
                e.preventDefault(); this._deleteSelected();
            }
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────
    _createObjectCentered(type) {
        this.app.setTool(type);
        const { width, height } = this.app.state.stack.cardSize;
        const w = type === 'embed' ? 560 : type === 'emoji' ? 80 : type === 'button' ? 130 : 200;
        const h = type === 'embed' ? 315 : type === 'emoji' ? 80 : type === 'button' ? 36 : 100;
        const rect = { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h };
        const obj = this.app.addObject(type, rect);
        if (obj) { this.selectObject(obj); this.app.dialogs.openObjectInfo(obj); }
        this.app.setTool('pointer');
    }

    _deleteSelected() {
        const sel = this.app.state.selectedObject;
        if (sel && confirm(`Delete "${sel.name}"?`)) this.app.removeObject(sel.id);
    }
    _linkSelection() {
        const url = window.prompt("Enter URL for link (or leave empty to remove):");
        if (url === null) return;
        if (url === "") {
            document.execCommand('unlink', false);
        } else {
            document.execCommand('createLink', false, url);
        }
        // Force an input event on the ancestor to trigger auto-save
        const sel = window.getSelection();
        if (sel.rangeCount) {
            let node = sel.getRangeAt(0).commonAncestorContainer;
            while (node && node.nodeType !== 1) node = node.parentNode;
            if (node) node.dispatchEvent(new Event('input'));
        }
    }

    _cutObject() { this._copyObject(); this._deleteSelected(); }
    _copyObject() { const s = this.app.state.selectedObject; if (s) this._clipboard = JSON.parse(JSON.stringify(s)); }
    _pasteObject() {
        if (!this._clipboard) return;
        const gid = window._HC_model?.generateId || (() => Date.now().toString(36));
        const copy = {
            ...this._clipboard, id: gid(this._clipboard.type),
            rect: { ...this._clipboard.rect, x: this._clipboard.rect.x + 20, y: this._clipboard.rect.y + 20 }
        };
        this.app.state.currentCard.objects.push(copy);
        this.renderCard(); this.app.scheduleAutoSave();
    }
    _reorder(dir) {
        const sel = this.app.state.selectedObject; if (!sel) return;
        const objs = this.app.state.currentCard.objects;
        const i = objs.findIndex(o => o.id === sel.id); if (i === -1) return;
        const to = Math.max(0, Math.min(objs.length - 1, i + dir));
        [objs[i], objs[to]] = [objs[to], objs[i]];
        this.renderCard(); this.app.scheduleAutoSave();
    }
    _findCard() {
        const term = window.prompt('Find text in fields:');
        if (term) {
            this.app.engine.exec(`find "${term}"`);
        }
    }
    _newStack() {
        const doNew = () => {
            indexedDB.deleteDatabase('hypercod-db');
            location.reload();
        };

        this.app.dialogs.customConfirm(
            'Create New Stack?',
            'Creating a new stack will delete the current stack from your local browser storage.\n\nWould you like to export a backup of your current work before starting fresh?',
            [
                {
                    label: 'Export Stack and Make New',
                    variant: 'default',
                    callback: () => { this._exportStack(); setTimeout(doNew, 1000); }
                },
                {
                    label: 'Make New Without Exporting',
                    variant: 'danger',
                    callback: () => { if (confirm('Are you absolutely sure you want to delete your current work without a backup?')) doNew(); }
                }
            ]
        );
    }
    _exportStack() {
        const data = { stack: this.app.state.stack, backgrounds: this.app.state.backgrounds, cards: this.app.state.cards };
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = (this.app.state.stack?.name || 'stack') + '.json'; a.click();
    }
    _importStack() {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
        inp.onchange = (e) => {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const d = JSON.parse(ev.target.result);
                    this.app.state.stack = d.stack; this.app.state.backgrounds = d.backgrounds; this.app.state.cards = d.cards;
                    this.app.state.currentCardIndex = 0; await this.app.saveAll(); this.app.updateCurrentCard();
                } catch (err) { alert('Invalid stack file: ' + err.message); }
            };
            reader.readAsText(e.target.files[0]);
        };
        inp.click();
    }

    toggleTools(force) {
        const w = document.getElementById('tool-windoid');
        const show = force !== undefined ? force : w.style.display === 'none';
        w.style.display = show ? 'block' : 'none';
        this._updateMenuLabels();
    }

    _updateMenuLabels() {
        const platform = navigator.platform.toLowerCase();
        const isMac = platform.includes('mac');
        const cmdPrefix = isMac ? '⌘' : 'Ctrl+';

        const tw = document.getElementById('tool-windoid');
        const tel = document.getElementById('menu-tools-toggle');
        if (tel) {
            const span = tel.querySelector('span');
            if (span) span.textContent = (tw && tw.style.display === 'none') ? 'Show Tools' : 'Hide Tools';
        }

        const mw = document.getElementById('message-box');
        const mel = document.getElementById('menu-msgbox-toggle');
        if (mel) {
            const span = mel.querySelector('span');
            const key = mel.querySelector('.menu-key');
            if (span) span.textContent = (mw && mw.style.display === 'none') ? 'Show Message Box' : 'Hide Message Box';
            if (key) key.textContent = cmdPrefix + 'M';
        }

        const cw = document.getElementById('cards-windoid');
        const cel = document.getElementById('menu-cards-toggle');
        if (cel) {
            const span = cel.querySelector('span');
            const key = cel.querySelector('.menu-key');
            if (span) span.textContent = (cw && cw.style.display === 'none') ? 'Show Cards' : 'Hide Cards';
            if (key) key.textContent = cmdPrefix + 'L';
        }

        const hw = document.getElementById('help-windoid');
        const hel = document.getElementById('menu-help-toggle');
        if (hel) {
            const span = hel.querySelector('span');
            const key = hel.querySelector('.menu-key');
            if (span) span.textContent = (hw && hw.style.display === 'none') ? 'Show HyperCode Help' : 'Hide HyperCode Help';
            if (key) key.textContent = cmdPrefix + '/';
        }
    }

    async _exportAsWebsite() {
        if (!window.JSZip) {
            await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        const zip = new JSZip();
        const stackName = this.app.state.stack?.name || 'MyStack';

        // Core app files and assets to include in the bundle
        const ASSETS = [
            'index.html', 'app.css', 'app.js', 'db.js', 'model.js', 'engine.js', 'ui.js',
            'dialogs.js', 'messagebox.js', 'paint.js', 'help.js', 'cardlist.js', 'dither.js',
            'service-worker.js', 'manifest.json',
            'hypercod_700x700.png', 'hypercode_favicon_192x192.png',
            'HyperCod Reference.html', 'Javascript Reference.html'
        ];

        console.log('[Export] Starting bundle process for ' + ASSETS.length + ' assets...');

        // Fetch and bundle each file at the root of the ZIP
        for (const file of ASSETS) {
            try {
                // Use a cache-busting query to bypass the Service Worker and ensure we get the latest file
                const url = './' + encodeURI(file) + '?_cb=' + Date.now();
                const resp = await fetch(url);

                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const blob = await resp.blob();
                zip.file(file, blob);
                console.log(`[Export] Successfully bundled: ${file}`);
            } catch (e) {
                console.error(`[Export] CRITICAL FAILURE bundling ${file}:`, e);
            }
        }

        // Create the bundled data object
        const data = {
            stack: this.app.state.stack,
            backgrounds: this.app.state.backgrounds,
            cards: this.app.state.cards,
            isPublished: true
        };

        // Prepare the index.html
        const htmlResp = await fetch('./index.html');
        let html = await htmlResp.text();

        // Escape </script tags to avoid premature script ending and ensure clean JSON
        const safeData = JSON.stringify(data).replace(/<\/script/g, '<\\/script');
        const dataScript = `<script>window.HC_DATA = ${safeData};</script>`;

        if (/<head>/i.test(html)) {
            html = html.replace(/<head>/i, `<head>\n  ${dataScript}`);
        } else {
            html = dataScript + '\n' + html;
        }

        // Overwrite the index.html in the ZIP with the one including HC_DATA
        zip.file('index.html', html);

        // Generate the ZIP and trigger download
        const content = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `${stackName}.zip`;
        a.click();
    }

    _loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url; s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    _makeDraggable(el, handle) {
        let ox = 0, oy = 0, sx = 0, sy = 0;
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault(); sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
            const mm = (e2) => { el.style.left = (ox + e2.clientX - sx) + 'px'; el.style.top = (oy + e2.clientY - sy) + 'px'; };
            const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
            document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
        });
    }
}
