/**
 * Property Dialogs — HyperCard PWA
 * Provides info/edit dialogs for Stack, Background, Card, and Object.
 */
import { DitherProcessor } from './dither.js';

export class Dialogs {
  constructor(app) {
    this.app = app;
    this._overlay = null;
    this._current = null;
  }

  _show(html, onSave) {
    this._close();
    const overlay = document.createElement('div');
    overlay.id = 'dialog-overlay';
    overlay.innerHTML = `<div class="dialog-box">${html}</div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this._close(); });
    document.body.appendChild(overlay);
    this._overlay = overlay;

    overlay.querySelector('.dlg-cancel')?.addEventListener('click', () => this._close());
    overlay.querySelector('.dlg-ok')?.addEventListener('click', () => { onSave?.(); this._close(); });

    // Tab switching
    overlay.querySelectorAll('.dlg-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.dlg-tab').forEach(t => t.classList.remove('active'));
        overlay.querySelectorAll('.dlg-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        overlay.querySelector(`.dlg-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
      });
    });
    overlay.querySelector('.dlg-tab')?.classList.add('active');
    overlay.querySelector('.dlg-panel')?.classList.add('active');

    // Auto-focus name field if present
    setTimeout(() => {
      const nameFld = overlay.querySelector('#d-name');
      if (nameFld) {
        nameFld.focus();
        nameFld.select();
      }
    }, 10);
  }

  _close() {
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
  }

  alert(title, message) {
    const html = `
            <div class="dlg-header"><strong>${this._esc(title)}</strong></div>
            <div style="padding: 20px; font-size: 14px; line-height: 1.5; min-height: 80px; display: flex; align-items: center; gap: 15px;">
              <div style="font-size: 32px;">⚠️</div>
              <div>${this._esc(message)}</div>
            </div>
            <div class="dlg-footer" style="justify-content: flex-end;">
              <button class="dlg-ok mac-btn mac-btn-default">OK</button>
            </div>
        `;
    this._show(html);
  }

  customConfirm(title, message, options = []) {
    // options: [{ label: string, callback: function, variant: 'default'|'danger'|null }]
    const html = `
            <div class="dlg-header"><strong>${this._esc(title)}</strong></div>
            <div style="padding: 20px; font-size: 14px; line-height: 1.5; min-height: 100px;">
              ${this._esc(message).replace(/\n/g, '<br>')}
            </div>
            <div class="dlg-footer" style="gap: 10px;">
                ${options.map((opt, i) => `
                    <button id="custom-opt-${i}" class="mac-btn ${opt.variant === 'default' ? 'mac-btn-default' : ''}" style="${opt.variant === 'danger' ? 'color: #cc0000; font-weight: bold;' : ''}">
                        ${this._esc(opt.label)}
                    </button>
                `).join('')}
                <button class="dlg-cancel mac-btn">Cancel</button>
            </div>
        `;
    this._show(html);
    options.forEach((opt, i) => {
      const btn = document.getElementById(`custom-opt-${i}`);
      if (btn) btn.onclick = () => { opt.callback?.(); this._close(); };
    });
  }


  // ── Object Info (Button / Field / Image) ─────────────────────────────────────
  openObjectInfo(obj) {
    if (!obj) return;
    const isBtn = obj.type === 'button';
    const isFld = obj.type === 'field';
    const isImg = obj.type === 'image';
    const isAudio = obj.type === 'audio';
    const isEmbed = obj.type === 'embed';

    const html = `
      <div class="dlg-header">
        <strong>${obj.type.charAt(0).toUpperCase() + obj.type.slice(1)} Info</strong>
        <span class="dlg-id">id: ${obj.id}</span>
      </div>
      <div class="dlg-tabs">
        <button class="dlg-tab" data-tab="props">Properties</button>
        ${isFld ? '<button class="dlg-tab" data-tab="content">Content</button>' : ''}
        <button class="dlg-tab" data-tab="script">Script</button>
      </div>
      <div class="dlg-panel" data-panel="props">
        <label>Name: <input id="d-name" type="text" value="${this._esc(obj.name)}"></label>
        
        <div class="dlg-row-dense">
          <label>X: <input id="d-x" type="number" value="${obj.rect.x}"></label>
          <label>Y: <input id="d-y" type="number" value="${obj.rect.y}"></label>
          <label>W: <input id="d-w" type="number" value="${obj.rect.width}"></label>
          <label>H: <input id="d-h" type="number" value="${obj.rect.height}"></label>
        </div>

        <label>Rotation: <input id="d-rot" type="range" min="0" max="360" value="${obj.rotation || 0}" style="flex:1"> <span id="rot-val">${obj.rotation || 0}</span>°</label>

        ${isBtn || isFld ? `
        <div class="dlg-row-dense">
          <label title="Style">St: <select id="d-style">${this._styleOptions(obj.type, obj.style)}</select></label>
          <label title="Font Size">Sz: <input id="d-fs" type="number" value="${obj.fontSize}"></label>
          <label title="Font Family">Ft: 
            <select id="d-font" style="flex:1">
              ${['system-ui, sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Impact', 'Comic Sans MS'].map(f => `<option value="${f}" ${obj.fontFamily === f ? 'selected' : ''}>${f.split(',')[0]}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="dlg-row">
          <label>Text Color: <input id="d-tc" type="color" value="${obj.textColor}"></label>
          <label>Fill Color: <input id="d-fc" type="color" value="${obj.fillColor}"></label>
        </div>` : ''}

        ${isFld ? `
        <div class="dlg-row">
          <label>Align: 
            <select id="d-align">
              <option value="left" ${obj.textAlign === 'left' ? 'selected' : ''}>Left</option>
              <option value="center" ${obj.textAlign === 'center' ? 'selected' : ''}>Center</option>
              <option value="right" ${obj.textAlign === 'right' ? 'selected' : ''}>Right</option>
            </select>
          </label>
          <label>Style: 
            <select id="d-tstyle">
              <option value="normal" ${obj.textStyle === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="bold" ${obj.textStyle === 'bold' ? 'selected' : ''}>Bold</option>
              <option value="italic" ${obj.textStyle === 'italic' ? 'selected' : ''}>Italic</option>
              <option value="bold italic" ${obj.textStyle === 'bold italic' ? 'selected' : ''}>Bold Italic</option>
            </select>
          </label>
        </div>
        <div class="dlg-row checkboxes-row">
          <label><input id="d-editable" type="checkbox" ${obj.editable ? 'checked' : ''}> Editable</label>
          <label><input id="d-locktext" type="checkbox" ${obj.lockText ? 'checked' : ''}> Lock</label>
          <label><input id="d-multiline" type="checkbox" ${obj.multiLine ? 'checked' : ''}> Multi</label>
          <label><input id="d-links" type="checkbox" ${obj.allowLinks ? 'checked' : ''}> Links</label>
        </div>` : ''}

        ${isBtn ? `
          <label>Title: <input id="d-title" type="text" value="${this._esc(obj.title || '')}"></label>
        ` : ''}

        <div class="dlg-row checkboxes-row">
          ${isBtn ? `<label><input id="d-enabled" type="checkbox" ${obj.enabled ? 'checked' : ''}> Enabled</label>` : ''}
          <label><input id="d-visible" type="checkbox" ${obj.visible ? 'checked' : ''}> Visible</label>
          ${isBtn ? `<label><input id="d-hilite" type="checkbox" ${obj.autoHilite ? 'checked' : ''}> Auto-Hilite</label>` : ''}
          <label><input id="d-hidehome" type="checkbox" ${obj.hideOnHome ? 'checked' : ''}> Hide on Home Card</label>
        </div>

        ${isImg ? `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <label style="margin:0;">Image src:</label>
            <span id="d-filesize" style="font-size:11px; color:#666;">Size: ${this._getImageSize(obj.src)}</span>
          </div>
          <div style="display:flex; gap:4px; margin-bottom:4px;">
            <input id="d-src" type="text" value="${this._esc(obj.src)}" style="flex:1;">
            <button id="d-pick-img" type="button" class="mac-btn" style="padding:0 8px;">Import...</button>
          </div>
          <label>Fit: <select id="d-fit">${['cover', 'contain', 'fill', 'none'].map(v => `<option ${obj.fit === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}

        ${isAudio ? `
          <label>Audio src:</label>
          <div style="display:flex; gap:4px; margin-bottom:4px;">
            <input id="d-src" type="text" value="${this._esc(obj.src)}" style="flex:1;">
            <button id="d-pick-audio" type="button" class="mac-btn" style="padding:0 8px;">Pick...</button>
          </div>
          <div class="dlg-row checkboxes-row">
            <label><input id="d-controls" type="checkbox" ${obj.controls ? 'checked' : ''}> Controls</label>
            <label><input id="d-autoplay" type="checkbox" ${obj.autoplay ? 'checked' : ''}> Autoplay</label>
            <label><input id="d-loop" type="checkbox" ${obj.loop ? 'checked' : ''}> Loop</label>
          </div>` : ''}

        ${isEmbed ? `<label>Embed Code:<br><textarea id="d-htmlcode" class="dlg-textarea" style="height:80px">${this._esc(obj.htmlCode || '')}</textarea></label>` : ''}
        
        <label>Layer: <select id="d-layer"><option ${obj.layer === 'card' ? 'selected' : ''}>card</option><option ${obj.layer === 'background' ? 'selected' : ''}>background</option></select></label>
      </div>
      ${isFld ? `
      <div class="dlg-panel" data-panel="content">
        <label style="font-weight:bold;">Text Content:</label>
        <div class="wysiwyg-container">
          <div class="wysiwyg-toolbar">
            <select id="wysiwyg-format">
              <option value="p">Normal</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </select>
            <button type="button" data-cmd="bold" title="Bold"><strong>B</strong></button>
            <button type="button" data-cmd="italic" title="Italic"><em>I</em></button>
            <button type="button" data-cmd="createLink" title="Link">🔗</button>
            <button type="button" data-cmd="insertUnorderedList" title="Bullets">•</button>
            <button type="button" data-cmd="insertOrderedList" title="Numbers">1.</button>
            <button type="button" data-cmd="removeFormat" title="Clear">✖</button>
          </div>
          <div id="d-content" class="wysiwyg-editor" contenteditable="true">${obj.content || ''}</div>
        </div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">-- Live update enabled. Rich text supported.</div>
      </div>` : ''}
      <div class="dlg-panel" data-panel="script">
        <div class="script-hint">-- HyperCode: <em>on mouseUp … end mouseUp</em> &nbsp;|&nbsp; // @javascript mode</div>
        <textarea id="d-script" class="script-editor">${this._esc(obj.script || this._scriptTemplate(obj.type))}</textarea>
      </div>
      <div class="dlg-footer">
        <button class="dlg-cancel mac-btn">Cancel</button>
        <button class="dlg-ok mac-btn mac-btn-default">OK</button>
      </div>`;

    this._show(html, () => {
      const g = (id) => document.getElementById(id);
      obj.name = g('d-name')?.value || obj.name;
      obj.rect.x = +g('d-x')?.value || 0;
      obj.rect.y = +g('d-y')?.value || 0;
      obj.rect.width = Math.max(10, +g('d-w')?.value || 60);
      obj.rect.height = Math.max(10, +g('d-h')?.value || 20);
      obj.rotation = +g('d-rot')?.value || 0;
      obj.visible = g('d-visible')?.checked ?? true;
      obj.hideOnHome = g('d-hidehome')?.checked ?? false;
      obj.layer = g('d-layer')?.value || 'card';
      obj.script = g('d-script')?.value || '';
      if (isBtn || isFld) {
        obj.style = g('d-style')?.value || obj.style;
        obj.fontSize = +g('d-fs')?.value || 16;
        obj.fontFamily = g('d-font')?.value || obj.fontFamily;
        obj.textColor = g('d-tc')?.value || '#000000';
        obj.fillColor = g('d-fc')?.value || '#ffffff';
      }
      if (isBtn) {
        obj.title = g('d-title')?.value || '';
        obj.enabled = g('d-enabled')?.checked ?? true;
        obj.autoHilite = g('d-hilite')?.checked ?? false;
      }
      if (isFld) {
        obj.editable = g('d-editable')?.checked ?? true;
        obj.lockText = g('d-locktext')?.checked ?? false;
        obj.multiLine = g('d-multiline')?.checked ?? true;
        obj.allowLinks = g('d-links')?.checked ?? true;
        obj.textAlign = g('d-align')?.value || 'left';
        obj.textStyle = g('d-tstyle')?.value || 'normal';
        obj.content = g('d-content')?.innerHTML || '';
      }
      if (isImg) {
        obj.src = g('d-src')?.value || '';
        obj.fit = g('d-fit')?.value || 'cover';
      }
      if (isAudio) {
        obj.src = g('d-src')?.value || '';
        obj.controls = g('d-controls')?.checked ?? true;
        obj.autoplay = g('d-autoplay')?.checked ?? false;
        obj.loop = g('d-loop')?.checked ?? false;
      }
      if (isEmbed) {
        obj.htmlCode = g('d-htmlcode')?.value || '';
      }
      if (obj.type === 'emoji') { obj.emoji = g('d-emoji')?.value || '🚀'; }

      // Move between card and background layers
      const newLayer = obj.layer;
      const card = this.app.state.currentCard;
      const bg = this.app.state.currentBackground;
      const inCard = card.objects.some(o => o.id === obj.id);
      const inBg = bg?.objects.some(o => o.id === obj.id);
      if (newLayer === 'background' && inCard) {
        card.objects = card.objects.filter(o => o.id !== obj.id);
        bg?.objects.push(obj);
      } else if (newLayer === 'card' && inBg && bg) {
        bg.objects = bg.objects.filter(o => o.id !== obj.id);
        card.objects.push(obj);
      }

      this.app.ui.renderCard();
      this.app.scheduleAutoSave();
    });

    // Rotation live update
    const rotInput = this._overlay?.querySelector('#d-rot');
    const rotVal = this._overlay?.querySelector('#rot-val');
    // Live update for properties
    const g = (id) => this._overlay?.querySelector('#' + id);
    const updateRender = () => this.app.ui.renderCard();

    ['d-x', 'd-y', 'd-w', 'd-h'].forEach(id => {
      g(id)?.addEventListener('input', (e) => {
        const val = +e.target.value;
        if (id === 'd-x') obj.rect.x = val;
        if (id === 'd-y') obj.rect.y = val;
        if (id === 'd-w') obj.rect.width = val;
        if (id === 'd-h') obj.rect.height = val;
        updateRender();
      });
    });

    ['d-style', 'd-fs', 'd-font', 'd-tc', 'd-fc', 'd-visible', 'd-enabled', 'd-hilite', 'd-hidehome'].forEach(id => {
      g(id)?.addEventListener('input', (e) => {
        const el = e.target;
        const val = el.type === 'checkbox' ? el.checked : el.value;
        if (id === 'd-style') obj.style = val;
        if (id === 'd-fs') obj.fontSize = +val;
        if (id === 'd-font') obj.fontFamily = val;
        if (id === 'd-tc') obj.textColor = val;
        if (id === 'd-fc') obj.fillColor = val;
        if (id === 'd-visible') obj.visible = val;
        if (id === 'd-enabled') obj.enabled = val;
        if (id === 'd-hilite') obj.autoHilite = val;
        if (id === 'd-hidehome') obj.hideOnHome = val;
        updateRender();
      });
    });

    if (rotInput) {
      rotInput.oninput = () => {
        const val = +rotInput.value;
        if (rotVal) rotVal.textContent = val;
        obj.rotation = val;
        updateRender();
      };
    }

    // Image Import logic
    if (isImg) {
      const pickBtn = this._overlay?.querySelector('#d-pick-img');
      const srcInp = this._overlay?.querySelector('#d-src');
      const sizeSpan = this._overlay?.querySelector('#d-filesize');
      if (pickBtn) {
        pickBtn.onclick = () => {
          this._pickImageFile((dataUrl) => {
            if (srcInp) srcInp.value = dataUrl;
            if (sizeSpan) sizeSpan.textContent = 'Size: ' + this._getImageSize(dataUrl);
            obj.src = dataUrl;
            this.app.ui.renderCard();
          });
        };
      }
      if (srcInp) {
        srcInp.oninput = () => {
          if (sizeSpan) sizeSpan.textContent = 'Size: ' + this._getImageSize(srcInp.value);
          obj.src = srcInp.value;
          this.app.ui.renderCard();
        };
      }
    }

    const grid = this._overlay?.querySelector('#emoji-grid');
    if (grid) {
      const emojis = [
        // Navigation
        { c: '⬅️', n: 'arrow left back' }, { c: '➡️', n: 'arrow right next' }, { c: '⬆️', n: 'arrow up' }, { c: '⬇️', n: 'arrow down' },
        { c: '◀️', n: 'arrow triangle left' }, { c: '▶️', n: 'arrow triangle right' }, { c: '🔼', n: 'arrow up' }, { c: '🔽', n: 'arrow down' },
        { c: '⏪', n: 'fast back' }, { c: '⏩', n: 'fast forward' }, { c: '⏫', n: 'up' }, { c: '⏬', n: 'down' },
        { c: '↩️', n: 'return back' }, { c: '↪️', n: 'forward' }, { c: '⤴️', n: 'up' }, { c: '⤵️', n: 'down' },
        // Documents & UI
        { c: '📄', n: 'document page paper' }, { c: '📃', n: 'document page' }, { c: '📜', n: 'scroll document' }, { c: '📑', n: 'tabs bookmarks' },
        { c: '📁', n: 'folder' }, { c: '📂', n: 'folder open' }, { c: '📅', n: 'calendar date' }, { c: '📆', n: 'calendar' },
        { c: '📝', n: 'note pencil write' }, { c: '✏️', n: 'pencil' }, { c: '🖋️', n: 'pen' }, { c: '🖊️', n: 'pen' }, { c: '🖌️', n: 'brush paint' },
        { c: '🗑️', n: 'trash bin delete' }, { c: '📥', n: 'inbox' }, { c: '📤', n: 'outbox' }, { c: '📦', n: 'box package' },
        { c: '🔍', n: 'search glass find zoom' }, { c: '🔎', n: 'search find' }, { c: '🔗', n: 'link' }, { c: '📎', n: 'clip paperclip' },
        { c: '📍', n: 'pin map mark' }, { c: '📌', n: 'pin' }, { c: '🏷️', n: 'tag label' }, { c: '🚩', n: 'flag' },
        // Hardware & Media
        { c: '📱', n: 'phone mobile smartphone' }, { c: '💻', n: 'laptop computer' }, { c: '🖥️', n: 'desktop monitor' }, { c: '⌨️', n: 'keyboard' }, { c: '🖱️', n: 'mouse' },
        { c: '📷', n: 'camera photo' }, { c: '📹', n: 'video camera' }, { c: '📺', n: 'tv screen' }, { c: '📻', n: 'radio' },
        { c: '🎞️', n: 'film movie' }, { c: '🎬', n: 'clapper cinema theater' }, { c: '🔋', n: 'battery power' }, { c: '🔌', n: 'plug electric' },
        { c: '💿', n: 'disk cd dvd' }, { c: '💾', n: 'floppy disk save' }, { c: '📼', n: 'tape video vhs' }, { c: '🕹️', n: 'joystick game' },
        // Status & Symbols
        { c: '💡', n: 'idea light bulb bright' }, { c: '⚙️', n: 'gear settings cog' }, { c: '🛠️', n: 'tools build repair' }, { c: '🔧', n: 'wrench tool' },
        { c: '⚖️', n: 'scales justice balance' }, { c: '💎', n: 'diamond gem jewel' }, { c: '🔔', n: 'bell notify alarm' }, { c: '🔕', n: 'bell off silent' },
        { c: '💬', n: 'bubble talk chat message' }, { c: '👁️', n: 'eye visible view' }, { c: '🕶️', n: 'sunglasses cool dark' }, { c: '🛑', n: 'stop sign' },
        { c: '✅', n: 'check ok yes' }, { c: '❌', n: 'cross no fail delete' }, { c: '➕', n: 'plus add' }, { c: '➖', n: 'minus remove' },
        { c: '⭐', n: 'star favorite' }, { c: '🌟', n: 'star shine' }, { c: '✨', n: 'sparkles magic' }, { c: '🔥', n: 'fire hot flame' },
        // Nature & Places
        { c: '🌍', n: 'earth world globe' }, { c: '🌎', n: 'earth world' }, { c: '🌏', n: 'earth world' }, { c: '🗺️', n: 'map world' },
        { c: '🏠', n: 'home house' }, { c: '🏢', n: 'office building' }, { c: '🏨', n: 'hotel building' }, { c: '🏥', n: 'hospital' },
        { c: '☀️', n: 'sun weather hot' }, { c: '🌙', n: 'moon night' }, { c: '☁️', n: 'cloud weather' }, { c: '🌧️', n: 'rain weather' },
        { c: '⚡', n: 'bolt lightning flash' }, { c: '❄️', n: 'snow cold ice' }, { c: '🌈', n: 'rainbow' }, { c: '🌲', n: 'tree forest nature' },
        // People & Faces
        { c: '😃', n: 'smile happy face' }, { c: '😊', n: 'smile' }, { c: '😎', n: 'smile cool' }, { c: '😂', n: 'laugh lol face' },
        { c: '😍', n: 'love heart eyes' }, { c: '🥰', n: 'love face' }, { c: '😘', n: 'kiss love' }, { c: '😋', n: 'yum tongue face' },
        { c: '🤔', n: 'think face mmm' }, { c: '🤨', n: 'hmm face' }, { c: '😐', n: 'neutral face' }, { c: '😑', n: 'bored face' },
        { c: '🙄', n: 'roll eye face' }, { c: '😏', n: 'smirk face' }, { c: '😣', n: 'struggle face' }, { c: '😥', n: 'sad sweat face' }
      ];

      const populate = (filter = '') => {
        grid.innerHTML = '';
        const tokens = filter.toLowerCase().split(/\s+/).filter(t => t);
        emojis.filter(e => {
          if (tokens.length === 0) return true;
          return tokens.every(t => e.n.includes(t));
        }).forEach(e => {
          const b = document.createElement('button');
          b.className = 'emoji-grid-btn';
          b.type = 'button';
          b.textContent = e.c;
          b.title = e.n;
          b.onclick = () => { document.getElementById('d-emoji').value = e.c; };
          grid.appendChild(b);
        });
      };

      populate();
      const searchField = this._overlay.querySelector('#d-emoji-search');
      if (searchField) {
        searchField.oninput = (e) => populate(e.target.value);
        setTimeout(() => searchField.focus(), 150);
      }
    }

    const pickAudio = this._overlay?.querySelector('#d-pick-audio');
    if (pickAudio) {
      pickAudio.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const srcInput = this._overlay?.querySelector('#d-src');
            if (srcInput) {
              srcInput.value = ev.target.result;
            }
          };
          reader.readAsDataURL(file);
        };
        input.click();
      };
    }

    // Live content update for Fields
    if (isFld) {
      const contentFld = this._overlay?.querySelector('#d-content');
      if (contentFld) {
        contentFld.addEventListener('input', () => {
          obj.content = contentFld.innerHTML;
          this.app.ui.renderCard(); // Trigger real-time re-render
        });
      }

      // Toolbar actions
      this._overlay?.querySelectorAll('.wysiwyg-toolbar button').forEach(btn => {
        btn.onclick = () => {
          const cmd = btn.dataset.cmd;
          let val = null;
          if (cmd === 'createLink') {
            val = prompt('Enter URL:');
            if (!val) return;
          }
          document.execCommand(cmd, false, val);
          contentFld?.focus();
          // Trigger input event to update model
          contentFld?.dispatchEvent(new Event('input'));
        };
      });

      const formatSelect = this._overlay?.querySelector('#wysiwyg-format');
      if (formatSelect) {
        formatSelect.onchange = (e) => {
          document.execCommand('formatBlock', false, `<${e.target.value}>`);
          contentFld?.focus();
          contentFld?.dispatchEvent(new Event('input'));
        };
      }
    }
  }

  // ── Stack / BG / Card Info ──────────────────────────────────────────────────
  openStackInfo() {
    const s = this.app.state.stack;
    const html = `
      <div class="dlg-header"><strong>Stack Info</strong></div>
      <div class="dlg-tabs">
        <button class="dlg-tab" data-tab="props">Properties</button>
        <button class="dlg-tab" data-tab="script">Script</button>
      </div>
      <div class="dlg-panel" data-panel="props">
        <label>Name: <input id="d-name" type="text" value="${this._esc(s.name)}"></label>
        <div class="dlg-row-dense">
          <label>Size W: <input id="d-w" type="number" value="${s.cardSize.width}"></label>
          <label>H: <input id="d-h" type="number" value="${s.cardSize.height}"></label>
        </div>
        <div class="dlg-row">
          <label>Stack Style: 
            <select id="d-style">
              ${['rectangle', 'roundrect', 'shadow', 'borderless'].map(v => `<option ${s.style === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
          <label><input id="d-trans" type="checkbox" ${s.isTransparent ? 'checked' : ''}> Transparent</label>
        </div>
        <div class="dlg-row">
          <label>Stack Color: <input id="d-scolor" type="color" value="${s.backgroundColor || '#ffffff'}"></label>
          <label>Pattern:
            <select id="d-pattern" style="flex:1">
              ${['none', 'dots', 'stripes', 'grid', 'checkerboard', 'bricks'].map(v => `<option ${s.pattern === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="dlg-row">
          <label>Backdrop Color: <input id="d-bcolor" type="color" value="${s.backdropColor || '#e0e0e0'}"></label>
          <label>Pattern Color: <input id="d-pcolor" type="color" value="${s.patternColor || '#d0d0d0'}"></label>
        </div>
        <div class="dlg-row">
          <label>Created: ${new Date(s.createdAt).toLocaleString()}</label>
          <div style="display:flex; gap:4px;">
            <button id="d-add-bg-img" type="button" class="mac-btn" style="flex:none; padding: 4px 12px;">Add Image...</button>
            <button id="d-rem-bg-img" type="button" class="mac-btn" style="flex:none; padding: 4px 12px; color:#cc0000;">Remove</button>
          </div>
        </div>
      </div>
      <div class="dlg-panel" data-panel="script">
        <textarea id="d-script" class="script-editor">${this._esc(s.script || this._scriptTemplate('stack'))}</textarea>
      </div>
      <div class="dlg-footer">
        <button class="dlg-cancel mac-btn">Cancel</button>
        <button class="dlg-ok mac-btn mac-btn-default">OK</button>
      </div>`;

    this._show(html, () => {
      s.name = document.getElementById('d-name').value;
      s.cardSize.width = +document.getElementById('d-w').value;
      s.cardSize.height = +document.getElementById('d-h').value;
      s.style = document.getElementById('d-style')?.value || s.style;
      s.backdropColor = document.getElementById('d-bcolor').value;
      s.backgroundColor = document.getElementById('d-scolor').value;
      s.pattern = document.getElementById('d-pattern').value;
      s.patternColor = document.getElementById('d-pcolor').value;
      s.isTransparent = document.getElementById('d-trans').checked;
      s.script = document.getElementById('d-script').value;
      this.app.ui.renderCard();
      this.app.scheduleAutoSave();
    });

    this._overlay.querySelector('#d-add-bg-img').onclick = () => {
      this._pickImageFile((dataUrl) => {
        s.backgroundImage = dataUrl;
        this.app.ui.renderCard();
      });
    };
    this._overlay.querySelector('#d-rem-bg-img').onclick = () => {
      if (confirm('Remove stack background image?')) {
        s.backgroundImage = null;
        this.app.ui.renderCard();
      }
    };
  }

  openBackgroundInfo() {
    const bg = this.app.state.currentBackground;
    if (!bg) return;
    const html = `
      <div class="dlg-header"><strong>Background Info</strong></div>
      <div class="dlg-tabs">
        <button class="dlg-tab" data-tab="props">Properties</button>
        <button class="dlg-tab" data-tab="script">Script</button>
      </div>
      <div class="dlg-panel" data-panel="props">
        <label>Name: <input id="d-name" type="text" value="${this._esc(bg.name)}"></label>
        <div class="dlg-row-dense">
          <label>BG Color: <input id="d-color" type="color" value="${bg.backgroundColor}"></label>
          <label><input id="d-trans" type="checkbox" ${bg.isTransparent ? 'checked' : ''}> Transparent</label>
        </div>
        <div style="display:flex; gap:4px;">
          <button id="d-add-bg-img" type="button" class="mac-btn" style="margin-top:8px; flex:1;">Add Image...</button>
          <button id="d-rem-bg-img" type="button" class="mac-btn" style="margin-top:8px; flex:1; color:#cc0000;">Remove</button>
        </div>
      </div>
      <div class="dlg-panel" data-panel="script">
        <textarea id="d-script" class="script-editor">${this._esc(bg.script || this._scriptTemplate('background'))}</textarea>
      </div>
      <div class="dlg-footer">
        <button class="dlg-cancel mac-btn">Cancel</button>
        <button class="dlg-ok mac-btn mac-btn-default">OK</button>
      </div>`;

    this._show(html, () => {
      bg.name = document.getElementById('d-name').value;
      bg.backgroundColor = document.getElementById('d-color').value;
      bg.isTransparent = document.getElementById('d-trans').checked;
      bg.script = document.getElementById('d-script').value;
      this.app.ui.renderCard();
      this.app.scheduleAutoSave();
    });

    this._overlay.querySelector('#d-add-bg-img').onclick = () => {
      this._pickImageFile((dataUrl) => {
        bg.backgroundImage = dataUrl;
        this.app.ui.renderCard();
      });
    };
    this._overlay.querySelector('#d-rem-bg-img').onclick = () => {
      if (confirm('Remove background image?')) {
        bg.backgroundImage = null;
        this.app.ui.renderCard();
      }
    };
  }

  openCardInfo() {
    const c = this.app.state.currentCard;
    if (!c) return;
    const html = `
      <div class="dlg-header"><strong>Card Info</strong></div>
      <div class="dlg-tabs">
        <button class="dlg-tab" data-tab="props">Properties</button>
        <button class="dlg-tab" data-tab="script">Script</button>
      </div>
      <div class="dlg-panel" data-panel="props">
        <label style="display:flex; align-items:center; gap:8px;">
          Name: <input id="d-name" type="text" value="${this._esc(c.name)}">
          <span id="name-warning" style="color:#cc0000; font-size:11px; font-weight:bold;"></span>
        </label>
        <div class="dlg-row-dense">
          <label>BG Color: <input id="d-color" type="color" value="${c.backgroundColor || '#ffffff'}"></label>
          <label><input id="d-trans" type="checkbox" ${c.isTransparent ? 'checked' : ''}> Transparent</label>
        </div>
        <div style="display:flex; gap:4px;">
          <button id="d-add-bg-img" type="button" class="mac-btn" style="margin-top:8px; flex:1;">Add Image...</button>
          <button id="d-rem-bg-img" type="button" class="mac-btn" style="margin-top:8px; flex:1; color:#cc0000;">Remove</button>
        </div>
      </div>
      <div class="dlg-panel" data-panel="script">
        <textarea id="d-script" class="script-editor">${this._esc(c.script || this._scriptTemplate('card'))}</textarea>
      </div>
      <div class="dlg-footer">
        <button class="dlg-cancel mac-btn">Cancel</button>
        <button class="dlg-ok mac-btn mac-btn-default">OK</button>
      </div>`;

    this._show(html, () => {
      c.name = document.getElementById('d-name').value;
      c.backgroundColor = document.getElementById('d-color').value;
      c.isTransparent = document.getElementById('d-trans').checked;
      c.script = document.getElementById('d-script').value;
      this.app.ui.renderCard();
      this.app.scheduleAutoSave();
      this.app.cardlist?.refresh();
    });

    this._overlay.querySelector('#d-add-bg-img').onclick = () => {
      this._pickImageFile((dataUrl) => {
        c.backgroundImage = dataUrl;
        this.app.ui.renderCard();
      });
    };
    this._overlay.querySelector('#d-rem-bg-img').onclick = () => {
      if (confirm('Remove card background image?')) {
        c.backgroundImage = null;
        this.app.ui.renderCard();
      }
    };

    // Add real-time duplicate name warning
    const nameInput = this._overlay.querySelector('#d-name');
    const warning = this._overlay.querySelector('#name-warning');
    if (nameInput && warning) {
      const checkName = () => {
        const newName = nameInput.value.trim().toLowerCase();
        if (!newName) {
          warning.textContent = "";
          return;
        }
        const exists = this.app.state.cards.some(card =>
          card.id !== c.id && card.name.toLowerCase() === newName
        );
        warning.textContent = exists ? "⚠ Name already exists" : "";
      };
      nameInput.addEventListener('input', checkName);
      checkName(); // Check immediately on open
    }
  }

  // ── Dither Dialog ────────────────────────────────────────────────────────────
  openDitherDialog(src, onComplete) {
    const img = new Image();
    img.onload = () => {
      const html = `
          <div class="dlg-header"><strong>Import Image: Retro Effects</strong></div>
          <div class="dlg-panel active" style="display:flex; flex-direction:column; gap:12px;">
            <div id="dither-preview-box" style="width:100%; height:250px; background:#f0f0f0; border:1px solid #000; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              <img id="dither-preview" style="max-width:100%; max-height:100%; object-fit:contain;">
            </div>
            <div class="dlg-row">
              <label>Algorithm: 
                <select id="d-algo">
                  <option value="none">None (Original Color)</option>
                  ${Object.keys(DitherProcessor.algorithms).map(k => `<option value="${k}" ${k === 'Atkinson' ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
              </label>
              <label>Pixel Size: <input id="d-pix" type="number" value="1" min="1" max="10" style="width:50px"></label>
            </div>
            <div class="dlg-row">
              <label>Brightness: <input id="d-bri" type="range" min="-100" max="100" value="0"></label>
              <label>Contrast: <input id="d-con" type="range" min="-100" max="100" value="0"></label>
            </div>
            <label><input id="d-gray" type="checkbox" checked> Desaturate (Black & White)</label>
          </div>
          <div class="dlg-footer">
            <button class="dlg-ignore mac-btn">Skip Dithering</button>
            <button class="dlg-cancel mac-btn">Cancel Import</button>
            <button class="dlg-ok mac-btn mac-btn-default">Apply & Import</button>
          </div>`;

      this._show(html, async () => {
        const preview = document.getElementById('dither-preview');
        onComplete(preview.src);
      });

      // Re-wire buttons for custom flow
      const overlay = this._overlay;
      const okBtn = overlay.querySelector('.dlg-ok');
      const skipBtn = overlay.querySelector('.dlg-ignore');
      const cancelBtn = overlay.querySelector('.dlg-cancel');

      // Override base close behavior for Skip
      skipBtn.onclick = () => { onComplete(src); this._close(); };

      const update = async () => {
        const options = {
          algo: overlay.querySelector('#d-algo').value,
          brightness: +overlay.querySelector('#d-bri').value,
          contrast: +overlay.querySelector('#d-con').value,
          pixelSize: +overlay.querySelector('#d-pix').value,
          desaturate: overlay.querySelector('#d-gray').checked
        };
        const processed = await DitherProcessor.process(img, options);
        overlay.querySelector('#dither-preview').src = processed;
      };

      overlay.querySelectorAll('input, select').forEach(el => el.oninput = update);
      update();
    };
    img.src = src;
  }

  _scriptTemplate(type) {
    if (type === 'field') return "on mouseUp\n  -- your code goes here\nend mouseUp";
    if (type === 'button') return "on mouseUp\n  -- your code goes here\nend mouseUp";
    if (type === 'stack') return "on openStack\n  -- your code goes here\nend openStack";
    if (type === 'card') return "on openCard\n  -- your code goes here\nend openCard";
    if (type === 'background') return "on openBackground\n  -- your code goes here\nend openBackground";
    return "on mouseUp\n  -- your code goes here\nend mouseUp";
  }

  _styleOptions(type, current) {
    let options = [];
    if (type === 'button') options = ['roundrect', 'rect', 'shadow', 'opaque', 'transparent', 'standard', 'checkbox', 'radio'];
    if (type === 'field') options = ['rectangle', 'shadow', 'opaque', 'transparent', 'borderless', 'scrolling'];
    return options.map(v => `<option ${v === current ? 'selected' : ''}>${v}</option>`).join('');
  }

  _getImageSize(src) {
    if (!src) return '0 KB';
    if (src.startsWith('data:')) {
      const base64Length = src.split(',')[1].length;
      const sizeInBytes = (base64Length * (3 / 4)) - (src.endsWith('==') ? 2 : (src.endsWith('=') ? 1 : 0));
      return (sizeInBytes / 1024).toFixed(1) + ' KB';
    }
    return 'External';
  }

  _pickImageFile(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.openDitherDialog(ev.target.result, callback);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  _esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
