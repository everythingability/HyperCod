/**
 * HyperCode/JS Scripting Engine — HyperCard PWA
 * Supports: on/end handlers, go, put, get, get url, set, show/hide,
 * answer, ask, beep, wait, if/then/else/end if, repeat/end repeat,
 * string concatenation (&), arithmetic, plus full // @javascript mode.
 */
export class ScriptEngine {
    constructor(app) {
        this.app = app;
        this._findState = { term: '', cardIdx: -1, objIdx: -1 };
    }

    /** Dispatch a handler name into a script. Returns true if handled. */
    async dispatch(handlerName, script, sourceObjId = null) {
        if (!script || !script.trim()) return false;
        if (sourceObjId && sourceObjId.startsWith('obj')) {
            console.log(`[HC-DISPATCH] handler=${handlerName} obj=${sourceObjId} scriptLen=${script.length}`);
        }
        try {
            if (script.trimStart().startsWith('// @javascript'))
                return await this._runJS(script, handlerName, sourceObjId);
            return await this._runHyperTalk(script, handlerName, sourceObjId);
        } catch (err) {
            this._beep();
            this.app.dialogs.alert("Script Error", err.message || String(err));
            console.error('[Script Engine Error]', err);
            return false;
        }
    }

    /** Evaluate an expression string (used by message box). */
    async eval(expr) {
        return this._evalExpr(expr.trim(), {});
    }

    /** Execute one or more command lines (used by message box). */
    async exec(commandText) {
        const lines = commandText.split('\n').map(l => l.split('--')[0].trim()).filter(Boolean);
        await this._execLines(lines, {});
    }

    // ── JavaScript mode ──────────────────────────────────────────────────────────
    async _runJS(script, handlerName, sourceObjId) {
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        const fn = new AsyncFunction('app', 'handler', 'sourceId', script);
        await fn(this.app, handlerName, sourceObjId);
        return true;
    }

    // ── HyperTalk mode ───────────────────────────────────────────────────────────
    async _runHyperTalk(script, handlerName, sourceObjId) {
        const lines = script.split('\n').map(l => l.split('--')[0].trim()).filter(Boolean);
        const onRegex = new RegExp(`^on\\s+${handlerName}\\b`, 'i');
        const startIdx = lines.findIndex(l => onRegex.test(l));

        if (startIdx === -1) {
            if (handlerName !== 'idle' || (sourceObjId && sourceObjId.startsWith('obj'))) {
                console.warn(`[HC-DEBUG] Handler '${handlerName}' NOT FOUND for ${sourceObjId}. Script:`, script.slice(0, 100) + '...');
            }
            return false;
        }

        const endRegex = new RegExp(`^end\\s+${handlerName}\\b`, 'i');
        const locals = { _source: sourceObjId };
        let i = startIdx + 1;
        while (i < lines.length) {
            if (endRegex.test(lines[i])) break;
            i++;
        }
        const endIdx = i;
        const body = lines.slice(startIdx + 1, endIdx);
        await this._execLines(body, locals);
        return true;
    }

    // ── Line executor ────────────────────────────────────────────────────────────
    async _execLines(lines, locals, i = 0) {
        while (i < lines.length) {
            const line = lines[i];
            if (!line || line.startsWith('--')) { i++; continue; }
            if (/^if\s+/i.test(line)) { i = await this._execIf(lines, i, locals); continue; }
            if (/^repeat\b/i.test(line)) { i = await this._execRepeat(lines, i, locals); continue; }
            if (/^(end\s+(if|repeat)|else\b)/i.test(line)) { i++; continue; }
            await this._execLine(line, locals);
            i++;
        }
        return i;
    }

    async _execLine(line, locals) {
        // console.log(`[HC-DEBUG] Executing: ${line}`);
        const app = this.app;
        let m;

        // go [to] <spec>  (handles: "go next", "go last card", "go to card 3", "go card \"Home\"")
        if ((m = line.match(/^go(?:\s+to)?\s+(.+)$/i))) {
            let spec = m[1].trim()
                .replace(/^card\s+/i, '')   // strip leading "card "
                .replace(/\s+card$/i, '')   // strip trailing " card" (e.g. "go to last card")
                .replace(/^["']|["']$/g, ''); // strip surrounding quotes
            const n = parseInt(spec);
            await app.goToCard(isNaN(n) ? spec.toLowerCase() : n);
            return;
        }

        // put <expr> [into/before/after <container>]
        if ((m = line.match(/^put\s+(.+?)\s+(into|before|after)\s+(.+)$/i))) {
            const val = await this._evalExpr(m[1], locals);
            this._setContainer(m[3].trim(), String(val), m[2].toLowerCase(), locals);
            return;
        }
        if ((m = line.match(/^put\s+(.+)$/i))) {
            const val = await this._evalExpr(m[1], locals);
            locals.it = String(val); app.state.it = locals.it; return;
        }

        // get url "<url>"
        if ((m = line.match(/^get\s+url\s+["'](.+?)["']/i))) {
            try { locals.it = await (await fetch(m[1])).text(); }
            catch (e) { locals.it = `Error: ${e.message}`; }
            app.state.it = locals.it; return;
        }

        // get <expr>
        if ((m = line.match(/^get\s+(.+)$/i))) {
            locals.it = String(await this._evalExpr(m[1], locals));
            app.state.it = locals.it; return;
        }

        // set <prop> [of <obj>] to <val>
        if ((m = line.match(/^set\s+(.+?)\s+(?:of\s+(.+?)\s+)?to\s+(.+)$/i))) {
            const val = await this._evalExpr(m[3], locals);
            this._setProp(m[1].trim(), m[2] ? m[2].trim() : null, String(val), locals);
            return;
        }

        // show / hide <object>
        if ((m = line.match(/^(show|hide)\s+(.+)$/i))) { this._setVisible(m[2].trim(), m[1].toLowerCase() === 'show'); return; }

        // answer <expr>
        if ((m = line.match(/^answer\s+(.+)$/i))) { alert(String(await this._evalExpr(m[1], locals))); return; }

        // ask <expr>
        if ((m = line.match(/^ask\s+(.+)$/i))) {
            const res = window.prompt(String(await this._evalExpr(m[1], locals))) || '';
            locals.it = res; app.state.it = res; return;
        }

        // log <expr>
        if ((m = line.match(/^log\s+(.+)$/i))) {
            const val = await this._evalExpr(m[1], locals);
            console.log('[HC Log]', val);
            return;
        }

        // beep
        if (/^beep$/i.test(line)) { this._beep(); return; }

        // wait <n> [seconds|ticks]
        if ((m = line.match(/^wait\s+(\d+)\s*(seconds?|ticks?)?$/i))) {
            const ms = (m[2] || '').startsWith('s') ? +m[1] * 1000 : Math.round(+m[1] * (1000 / 60));
            await new Promise(r => setTimeout(r, ms)); return;
        }

        // open url
        if ((m = line.match(/^open\s+url\s+["'](.+?)["']/i))) { window.open(m[1], '_blank'); return; }

        // visual effect <effect>
        if ((m = line.match(/^visual(?:\s+effect)?\s+["']?([^"']+)["']?$/i))) {
            this.app.state.nextTransition = m[1].trim().toLowerCase().replace(/\s+/g, '-');
            return;
        }

        // animate <object> with <effect>
        if ((m = line.match(/^animate\s+(.+?)\s+with\s+["']?([^"']+)["']?$/i))) {
            const effect = m[2].trim().toLowerCase().replace(/\s+/g, '-');
            const targetSpec = m[1].trim();
            const target = (targetSpec.toLowerCase() === 'me' && locals._source)
                ? this.app.findObject(locals._source)
                : this.app.findObjectByName(targetSpec, null);

            if (target) {
                const el = document.querySelector(`[data-id="${target.id}"]`);
                if (el) {
                    const animClass = `hc-anim-${effect}`;
                    el.classList.remove(animClass);
                    void el.offsetWidth; // trigger reflow
                    el.classList.add(animClass);
                    el.addEventListener('animationend', () => el.classList.remove(animClass), { once: true });
                }
            }
            return;
        }

        // find <text> [in field <spec>]
        if ((m = line.match(/^find\s+(.+?)(?:\s+in\s+field\s+(.+))?$/i))) {
            const searchText = (await this._evalExpr(m[1], locals)).toLowerCase();
            const fieldSpec = m[2] ? m[2].trim() : null;
            await this._doFind(searchText, fieldSpec);
            return;
        }

        // <var> = <expr>
        if ((m = line.match(/^(\w+)\s*=\s*(.+)$/))) { locals[m[1]] = String(await this._evalExpr(m[2], locals)); return; }

        console.warn('[HyperTalk] Unknown:', line);
    }

    // ── Control flow ─────────────────────────────────────────────────────────────
    async _execIf(lines, i, locals) {
        const m = lines[i].match(/^if\s+(.+?)\s+then\s*(.*)$/i);
        if (!m) return i + 1;
        const cond = this._isTruthy(await this._evalExpr(m[1], locals));
        const inlineCmd = m[2].trim();

        if (cond) {
            if (inlineCmd) {
                await this._execLine(inlineCmd, locals);
                return i + 1; // Return here for inline if
            }
            let j = i + 1;
            let depth = 0;
            const block = [];
            while (j < lines.length) {
                const line = lines[j];
                if (/^if\s+/i.test(line)) depth++;
                if (/^end\s+if\b/i.test(line)) {
                    if (depth === 0) break;
                    depth--;
                }
                if (depth === 0 && /^else\b/i.test(line)) break;
                block.push(line);
                j++;
            }
            await this._execLines(block, locals);

            // Skip to end of if/else
            while (j < lines.length && !/^end\s+if\b/i.test(lines[j])) j++;
            return j + 1;
        } else {
            if (inlineCmd) {
                // If it's an inline if and condition is false, skip only i
                // But wait, there might be an inline else!
                // Actually, standard HyperTalk inline if doesn't have else on same line usually, 
                // but let's check for "else" in the block loop.
            }
            let j = i + 1;
            let depth = 0;
            while (j < lines.length) {
                const line = lines[j];
                if (/^if\s+/i.test(line)) depth++;
                if (/^end\s+if\b/i.test(line)) {
                    if (depth === 0) break;
                    depth--;
                }
                if (depth === 0 && /^else\b/i.test(line)) break;
                j++;
            }

            if (j < lines.length && /^else\b/i.test(lines[j])) {
                const elseIdx = j;
                const elseLine = lines[elseIdx];
                const inlineElseCmd = elseLine.replace(/^else\s+/i, '').trim();

                if (inlineElseCmd) {
                    // It's an "else if ..." or "else beep"
                    const remainingLines = [inlineElseCmd, ...lines.slice(elseIdx + 1)];
                    // We need a way to stop at the correct "end if"
                    // For "else if", we just execute the rest of the lines but they will be stopped by the outer end if
                    await this._execLines(remainingLines, locals);
                    return lines.length; // The recursive call handles the rest
                }

                let k = elseIdx + 1;
                depth = 0;
                const elseBlock = [];
                while (k < lines.length) {
                    const line = lines[k];
                    if (/^if\s+/i.test(line)) depth++;
                    if (/^end\s+if\b/i.test(line)) {
                        if (depth === 0) break;
                        depth--;
                    }
                    elseBlock.push(line);
                    k++;
                }
                await this._execLines(elseBlock, locals);
                return k + 1;
            }
            // For inline IF with no ELSE, just return i + 1
            if (inlineCmd) return i + 1;
            return j + 1;
        }
    }

    async _execRepeat(lines, i, locals) {
        const hdl = lines[i];
        const body = this._extractBlock(lines, i + 1, 'repeat');
        const after = i + body.length + 2;
        let m;

        if ((m = hdl.match(/^repeat\s+(\d+)\s+times?$/i))) {
            for (let k = 0; k < +m[1]; k++) await this._execLines(body, locals);
        } else if ((m = hdl.match(/^repeat\s+with\s+(\w+)\s*=\s*(-?\d+)\s+to\s+(-?\d+)$/i))) {
            for (let k = +m[2]; k <= +m[3]; k++) {
                locals[m[1]] = String(k); await this._execLines(body, locals);
            }
        } else if ((m = hdl.match(/^repeat\s+while\s+(.+)$/i))) {
            let safety = 0;
            while (this._isTruthy(await this._evalExpr(m[1], locals)) && safety++ < 9999)
                await this._execLines(body, locals);
        }
        return after;
    }

    _extractBlock(lines, start, kw) {
        const out = []; let depth = 0;
        for (let i = start; i < lines.length; i++) {
            const l = lines[i];
            if (new RegExp(`^${kw}\\b`, 'i').test(l)) depth++;
            if (new RegExp(`^end\\s+${kw}\\b`, 'i').test(l)) {
                if (depth === 0) break; depth--;
            }
            out.push(l);
        }
        return out;
    }

    // ── Expression evaluator ─────────────────────────────────────────────────────
    async _evalExpr(expr, locals) {
        expr = expr.trim();
        const app = this.app;

        // 1. Handle common simple tokens first
        if (/^"[^"]*"$/.test(expr) || /^'[^']*'$/.test(expr)) return expr.slice(1, -1);
        if (/^-?\d+(\.\d+)?$/.test(expr)) return expr;
        if (/^true$/i.test(expr)) return 'true';
        if (/^false$/i.test(expr)) return 'false';

        // 2. Resolve sub-expressions (Parentheses & Functions)
        let mParen;
        while ((mParen = expr.match(/(\w+)?\s*\(([^()]+)\)/))) {
            const func = mParen[1] ? mParen[1].toLowerCase() : null;
            const subExpr = mParen[2];
            let res = await this._evalExpr(subExpr, locals);

            if (func === 'random') {
                res = String(Math.floor(Math.random() * parseInt(res)) + 1);
                expr = expr.replace(mParen[0], res);
            } else if (func) {
                // For now, just concatenate if unknown function
                expr = expr.replace(mParen[0], func + res);
            } else {
                expr = expr.replace(mParen[0], res);
            }
        }

        // 3. Handle Binary Operators in order of precedence
        // Concatenation: &
        let idx = this._findOp(expr, '&');
        if (idx !== -1) {
            return String(await this._evalExpr(expr.slice(0, idx), locals)) +
                String(await this._evalExpr(expr.slice(idx + 1), locals));
        }

        // Comparison
        for (const op of ['>=', '<=', '<>', '!=', '>', '<', '=', ' is not ', ' is ']) {
            idx = this._findOp(expr, op);
            if (idx !== -1) {
                const L = await this._evalExpr(expr.slice(0, idx), locals);
                const R = await this._evalExpr(expr.slice(idx + op.length), locals);
                return this._compare(L, R, op.trim());
            }
        }

        // Arithmetic (+, -)
        let idxPlus = this._findOp(expr, '+');
        let idxMinus = this._findOp(expr, '-');
        idx = (idxPlus !== -1 && idxMinus !== -1) ? Math.min(idxPlus, idxMinus) : Math.max(idxPlus, idxMinus);
        if (idx !== -1) {
            const op = expr[idx];
            const L = parseFloat(await this._evalExpr(expr.slice(0, idx), locals));
            const R = parseFloat(await this._evalExpr(expr.slice(idx + 1), locals));
            const res = op === '+' ? L + R : L - R;
            return isNaN(res) ? '0' : String(res);
        }

        // Arithmetic (*, /)
        let idxMult = this._findOp(expr, '*');
        let idxDiv = this._findOp(expr, '/');
        idx = (idxMult !== -1 && idxDiv !== -1) ? Math.min(idxMult, idxDiv) : Math.max(idxMult, idxDiv);
        if (idx !== -1) {
            const op = expr[idx];
            const L = parseFloat(await this._evalExpr(expr.slice(0, idx), locals));
            const R = parseFloat(await this._evalExpr(expr.slice(idx + 1), locals));
            let res = op === '*' ? L * R : L / R;
            return isNaN(res) ? '0' : String(res);
        }

        // 4. Atomic values (Properties, Variables, Functions)

        // random n (shorthand without parens)
        let mFunc;
        if ((mFunc = expr.match(/^random\s+(\d+)$/i))) {
            return String(Math.floor(Math.random() * parseInt(mFunc[1])) + 1);
        }

        // the [prop] of [obj]
        let mObj;
        if ((mObj = expr.match(/^the\s+(\w+)\s+of\s+(this\s+(button|field|card)|(button|field|card|image|audio|embed|emoji|obj|object)\s+(["'](.+?)["']|(\w+))|me)$/i))) {
            const prop = mObj[1].toLowerCase();
            const type = (mObj[3] || mObj[4] || '').toLowerCase();
            const name = mObj[6] || mObj[7];

            let obj = null;
            if (expr.toLowerCase().endsWith('me') || mObj[3]) {
                obj = app.findObject(locals._source);
                // if (!obj) console.warn(`[Script Engine] Property Lookup: Failed to find 'me' object with ID ${locals._source}`);
            } else if (type === 'card') {
                obj = app.state.currentCard;
            } else {
                obj = app.findObjectByName(name, type);
            }

            if (obj) {
                if (obj.rect) {
                    if (prop === 'left' || prop === 'x') return String(obj.rect.x);
                    if (prop === 'top' || prop === 'y') return String(obj.rect.y);
                    if (prop === 'width') return String(obj.rect.width);
                    if (prop === 'height') return String(obj.rect.height);
                    if (prop === 'topleft' || prop === 'top-left') return `${obj.rect.x},${obj.rect.y}`;
                    if (prop === 'loc' || prop === 'location') return `${obj.rect.x + obj.rect.width / 2},${obj.rect.y + obj.rect.height / 2}`;
                }
                const val = obj[prop === 'text' ? 'content' : prop];
                return val !== undefined ? String(val) : '';
            }
        }

        // the [global prop]
        if (/^it$/i.test(expr)) return locals.it || app.state.it || '';
        if (/^the\s+date$/i.test(expr)) return new Date().toLocaleDateString();
        if (/^the\s+time$/i.test(expr)) return new Date().toLocaleTimeString();
        if (/^the\s+(card\s+)?width$/i.test(expr)) return String(app.state.stack?.cardSize?.width || 640);
        if (/^the\s+(card\s+)?height$/i.test(expr)) return String(app.state.stack?.cardSize?.height || 480);

        // Variables
        if (expr in locals) return String(locals[expr]);

        // console.log(`[Script Engine] Eval Result: "${expr}" -> "${expr}" (Atomic)`);
        return expr;
    }

    _compare(L, R, op) {
        const Ln = parseFloat(L), Rn = parseFloat(R);
        const useNum = !isNaN(Ln) && !isNaN(Rn);

        let a = useNum ? Ln : String(L).toLowerCase().trim();
        let b = useNum ? Rn : String(R).toLowerCase().trim();

        // Color normalization
        const normColor = (v) => {
            const s = String(v);
            if (s.startsWith('rgb(')) return s.replace(/\s+/g, '');
            if (s.startsWith('#') && s.length === 4) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
            return s;
        };
        if (!useNum) { a = normColor(a); b = normColor(b); }

        switch (op) {
            case '>=': return String(a >= b);
            case '<=': return String(a <= b);
            case '<>': case '!=': case 'is not': return String(a !== b);
            case '>': return String(a > b);
            case '<': return String(a < b);
            case '=': case 'is': return String(a === b);
        }
        return 'false';
    }
    _findOp(expr, op) {
        let depth = 0;
        for (let i = 0; i < expr.length - op.length + 1; i++) {
            const c = expr[i];
            if (c === '"') { i = expr.indexOf('"', i + 1); continue; }
            if (c === '(') depth++;
            if (c === ')') depth--;
            if (depth === 0 && expr.slice(i, i + op.length) === op) return i;
        }
        return -1;
    }

    _isTruthy(v) {
        if (typeof v === 'boolean') return v;
        const s = String(v).toLowerCase().trim();
        if (s === 'false' || s === '0' || s === '' || s === 'empty') return false;
        return true;
    }

    // ── Container / property IO ──────────────────────────────────────────────────
    _setContainer(spec, val, op, locals) {
        const app = this.app;
        // "field <name/id>" or "card field <name>"
        const fm = spec.match(/^(?:card\s+)?field\s+(?:["'](.+?)["']|(.+))$/i);
        if (fm) {
            const name = fm[1] || fm[2];
            const obj = app.findObjectByName(name, 'field');
            if (obj) {
                console.log(`[HC-DEBUG] field "${name}" updated to: ${val}`);
                if (op === 'into') obj.content = val;
                else if (op === 'before') obj.content = val + obj.content;
                else obj.content = (obj.content || '') + val;
                app.ui.renderCard();
                app.scheduleAutoSave();
            } else {
                console.warn(`[HC-DEBUG] Set Container: Could not find field "${name}"`);
            }
            return;
        }
        // "card <prop>" — just store in locals/it
        locals[spec] = val;
        app.state.it = val;
    }

    _setProp(prop, objSpec, val, locals) {
        const app = this.app;
        const normProp = prop.toLowerCase().replace(/^the\s+/, '');

        // Handle RGB shorthand: "255,0,0" -> "rgb(255,0,0)"
        if (/^\d+,\s*\d+,\s*\d+$/.test(val)) val = `rgb(${val})`;

        let obj = null;
        if (objSpec && objSpec.toLowerCase() === 'me') {
            obj = app.findObject(locals._source);
            if (!obj) console.warn(`[Script Engine] Set Prop: Failed to find 'me' object with ID ${locals._source}`);
        } else if (objSpec) {
            // Handle specifiers like: image "Fish" or button 1
            const mObj = objSpec.match(/^(button|field|card|image|audio|embed|emoji|obj|object)\s+(["'](.+?)["']|(\w+))$/i);
            if (mObj) {
                const type = mObj[1].toLowerCase();
                const name = mObj[3] || mObj[4];
                obj = app.findObjectByName(name, type);
            } else {
                obj = this.app.findObjectByName(objSpec, null);
            }
        }

        if (obj) {
            // console.log(`[HC-DEBUG] Set Prop ${prop} on ${obj.name || obj.id} to ${val}`);
            if (/name/i.test(normProp)) obj.name = val;
            else if (/title/i.test(normProp)) obj.title = val;
            else if (/visible/i.test(normProp)) obj.visible = val !== 'false';
            else if (/enabled/i.test(normProp)) obj.enabled = val !== 'false';
            else if (/content/i.test(normProp)) obj.content = val;
            else if (obj.rect) {
                if (normProp === 'left' || normProp === 'x') obj.rect.x = parseFloat(val);
                else if (normProp === 'top' || normProp === 'y') obj.rect.y = parseFloat(val);
                else if (normProp === 'width') obj.rect.width = parseFloat(val);
                else if (normProp === 'height') obj.rect.height = parseFloat(val);
                else if (normProp === 'topleft' || normProp === 'top-left') {
                    const parts = val.split(',');
                    if (parts.length === 2) {
                        obj.rect.x = parseFloat(parts[0]);
                        obj.rect.y = parseFloat(parts[1]);
                    }
                }
                else if (normProp === 'loc' || normProp === 'location') {
                    const parts = val.split(',');
                    if (parts.length === 2) {
                        obj.rect.x = parseFloat(parts[0]) - (obj.rect.width || 0) / 2;
                        obj.rect.y = parseFloat(parts[1]) - (obj.rect.height || 0) / 2;
                    }
                }
            }
            if (obj.name === 'Fish') console.log(`[Fish] Moving to ${obj.rect.x}, ${obj.rect.y}`);
            app.ui.renderCard();
            app.scheduleAutoSave();
        } else {
            console.warn(`[HC-ERROR] Set Prop: Could not find target object "${objSpec}"`);
            // Stack/Card properties
            let changed = false;
            if (/background.?color|bgcolor/i.test(normProp)) {
                if (app.state.currentCard) app.state.currentCard.backgroundColor = val;
                changed = true;
            } else if (/backdrop.?color/i.test(normProp)) {
                app.state.stack.backdropColor = val;
                changed = true;
            } else if (/pattern.?color/i.test(normProp)) {
                app.state.stack.patternColor = val;
                changed = true;
            } else if (/name.*card/i.test(normProp) && app.state.currentCard) {
                app.state.currentCard.name = val;
                changed = true;
            }

            if (changed) {
                app.ui.renderCard();
                app.scheduleAutoSave();
            }
        }
    }

    _setVisible(spec, visible) {
        const obj = this.app.findObjectByName(spec, null);
        if (obj) { obj.visible = visible; this.app.ui.renderCard(); this.app.scheduleAutoSave(); }
    }


    // ── Built-in API exposed to JS scripts ──────────────────────────────────────
    _buildAPI(locals) {
        const app = this.app;
        return {
            go: async (spec) => await app.goToCard(spec),
            currentCard: () => app.state.currentCard,
            currentStack: () => app.state.stack,
            cards: () => app.state.cards,
            addCard: () => app.addCard(),
            deleteCard: () => app.deleteCurrentCard(),
            alert: (msg) => alert(msg),
            prompt: (msg) => window.prompt(msg),
            fetch: (url, opts) => fetch(url, opts),
            log: (...args) => console.log('[HC JS]', ...args),
        };
    }

    async _doFind(term, fieldSpec) {
        const app = this.app;
        if (!term) return;

        // If new search term, reset state
        if (term !== this._findState.term) {
            this._findState = { term, cardIdx: app.state.currentCardIndex, objIdx: -1 };
        }

        const cards = app.state.cards;
        const startCard = this._findState.cardIdx;
        const startObj = this._findState.objIdx;

        // We'll search through all cards starting from current find state
        for (let i = 0; i < cards.length; i++) {
            const cardIdx = (startCard + i) % cards.length;
            const card = cards[cardIdx];
            const bg = app.state.backgrounds[card.backgroundId];
            const objs = [...(bg?.objects || []), ...(card.objects || [])];

            let j = (cardIdx === startCard) ? startObj + 1 : 0;
            for (; j < objs.length; j++) {
                const obj = objs[j];
                if (obj.type !== 'field') continue;
                if (fieldSpec && obj.name !== fieldSpec && obj.id !== fieldSpec) continue;

                const content = (obj.content || '').toLowerCase();
                if (content.includes(term)) {
                    // Update state for next find
                    this._findState = { term, cardIdx, objIdx: j };

                    // Navigate to card
                    if (cardIdx !== app.state.currentCardIndex) {
                        await app.goToCard(cardIdx + 1);
                    }

                    // Highlight (simplified: set 'it' and scroll to obj/focus)
                    app.state.it = obj.content;
                    console.log(`[Script Engine] Found "${term}" in field "${obj.name || obj.id}" on card ${cardIdx + 1}`);

                    // Flash the object in UI if rendered
                    setTimeout(() => {
                        const el = document.querySelector(`[data-id="${obj.id}"]`);
                        if (el) {
                            el.style.outline = '3px solid #ffff00';
                            setTimeout(() => el.style.outline = 'none', 1000);
                        }
                    }, 100);
                    return;
                }
            }
        }

        // Wrap around or report not found
        this._findState = { term: '', cardIdx: -1, objIdx: -1 };
        this._beep();
        app.dialogs.alert("Find", `Could not find "${term}" in any fields.`);
    }

    _beep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            osc.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.start(); osc.stop(ctx.currentTime + 0.1);
        } catch (_) { }
    }
}
