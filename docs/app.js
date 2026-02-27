/**
 * app.js — HyperCard PWA bootstrap & global state
 */
import { openDB, dbSave, dbLoad } from './db.js';
import { createStack, createBackground, createCard, createObject, generateId } from './model.js';
import { ScriptEngine } from './engine.js';
import { UI } from './ui.js';
import { Dialogs } from './dialogs.js';
import { MessageBox } from './messagebox.js';
import { Help } from './help.js';
import { CardList } from './cardlist.js';
import { PaintLayer } from './paint.js';

// Expose model helpers for ui.js paste utility
window._HC_model = { generateId };
console.log('HyperCod: app.js loaded');

const App = {
    db: null,
    messagebox: null,
    help: null,
    ui: null,
    state: {
        stack: null,
        backgrounds: {},     // { [bgId]: Background }
        cards: [],           // ordered array of Cards
        currentCardIndex: 0,
        currentCard: null,
        currentBackground: null,
        tool: 'browse',
        mode: 'browse',
        selectedObject: null,
        it: '',
        globals: {},
        history: [], // card navigation history
    },
    engine: null,
    ui: null,
    dialogs: null,
    messagebox: null,
    paint: null,
    _saveTimer: null,
    _idleRunning: false,

    scheduleAutoSave() {
        if (this.state.isPublished) return;
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.saveAll(), 600);
    },

    async saveAll() {
        const { stack, backgrounds, cards, isPublished } = this.state;
        if (!stack || isPublished) return;
        await dbSave('stacks', stack);
        for (const bg of Object.values(backgrounds)) await dbSave('backgrounds', bg);
        for (const card of cards) await dbSave('cards', card);
        await dbSave('appstate', {
            id: 'appstate',
            lastStackId: stack.id,
            lastCardIndex: this.state.currentCardIndex,
        });
    },

    async init() {
        console.log('[App] init: starting modules...');
        this.db = await openDB();
        this.engine = new ScriptEngine(this);
        this.ui = new UI(this);
        this.dialogs = new Dialogs(this);
        this.messagebox = new MessageBox(this);
        this.help = new Help(this);
        this.cardlist = new CardList(this);
        this.paint = new PaintLayer(this);
        console.log('[App] init: context modules ready');

        // Check for bundled data first (publishing mode)
        let loaded = false;
        const bundled = window.HC_DATA;
        if (bundled) {
            this.state.stack = bundled.stack;
            this.state.backgrounds = bundled.backgrounds;
            this.state.cards = bundled.cards;

            // Start at "Home" card if it exists, otherwise first card (ignore last authoring index)
            const homeIdx = bundled.cards.findIndex(c => c && c.name && c.name.toLowerCase() === 'home');
            this.state.currentCardIndex = (homeIdx >= 0) ? homeIdx : 0;
            // Allow an explicit edit override via URL (?edit=1) or localStorage.HC_EDIT
            try {
                const url = new URL(location.href);
                const editParam = url.searchParams.get('edit');
                const editFlag = editParam === '1' || localStorage.getItem('HC_EDIT') === '1';
                this.state.isPublished = !editFlag;
            } catch (e) {
                this.state.isPublished = true;
            }
            loaded = true;
        } else {
            // Load persisted state or create defaults
            const appState = await dbLoad('appstate', 'appstate');
            if (appState?.lastStackId) {
                const stack = await dbLoad('stacks', appState.lastStackId);
                if (stack) {
                    const backgrounds = {};
                    for (const bgId of stack.backgroundIds) {
                        const bg = await dbLoad('backgrounds', bgId);
                        if (bg) backgrounds[bgId] = bg;
                    }
                    const cards = [];
                    for (const cardId of stack.cardIds) {
                        const card = await dbLoad('cards', cardId);
                        if (card) cards.push(card);
                    }
                    if (cards.length) {
                        this.state.stack = stack;
                        this.state.backgrounds = backgrounds;
                        this.state.cards = cards;
                        this.state.currentCardIndex = Math.min(appState.lastCardIndex || 0, cards.length - 1);
                        loaded = true;
                    }
                }
            }
        }

        if (!loaded) await this._createDefaultStack();
        console.log('App.init: loaded=', loaded, 'stack=', !!this.state.stack, 'cards=', (this.state.cards || []).length);
        this.updateCurrentCard();
        this.ui.init();
        this.messagebox.init();
        this.help.init();
        this.cardlist.init();

        console.log('[App] init: firing startup events...');
        // Fire startUp, openStack, openCard
        if (this.state.stack?.script) {
            await this.engine.dispatch('startUp', this.state.stack.script);
            await this.engine.dispatch('openStack', this.state.stack.script);
        }
        await this.handleObjectEvent('openCard', null);

        console.log('[App] init: events done, checking service worker & idle loop');
        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js').catch(() => { });
        }

        this._startIdleLoop();
        console.log('[App] init: complete');
    },

    _startIdleLoop() {
        if (this._idleTimer) return;
        console.log('[App] Starting Idle Loop...');
        this._idleTimer = setInterval(async () => {
            if (this._idleRunning) return;
            this._idleRunning = true;
            try {
                const { currentCard, currentBackground } = this.state;
                if (currentCard) {
                    const objs = [...(currentBackground?.objects || []), ...(currentCard.objects || [])];
                    for (const obj of objs) {
                        if (obj.script) {
                            await this.engine.dispatch('idle', obj.script, obj.id);
                        }
                    }
                }
                await this.handleObjectEvent('idle', null);
            } catch (err) {
                console.error('[App] Global Idle Loop Error:', err);
            } finally {
                this._idleRunning = false;
            }
        }, 300);
    },

    async _createDefaultStack() {
        const stackId = generateId('stack');
        const bgId = generateId('bg');
        const cardId = generateId('card');

        const stack = createStack({ id: stackId, name: 'Untitled Stack', backgroundIds: [bgId], cardIds: [cardId] });
        const bg = createBackground({ id: bgId, stackId });
        const card = createCard({ id: cardId, stackId, backgroundId: bgId, name: 'Home', number: 1 });

        // Seed with a welcome button
        const btn = createObject({
            type: 'button', name: 'Welcome', title: 'Click Me!',
            rect: { x: 230, y: 210, width: 130, height: 40 },
            script: `on mouseUp\n  answer "Welcome to HyperCod! Double-click me in edit mode to change my script."\nend mouseUp`,
        });
        card.objects.push(btn);

        this.state.stack = stack;
        this.state.backgrounds = { [bgId]: bg };
        this.state.cards = [card];
        this.state.currentCardIndex = 0;
        await this.saveAll();
    },

    updateCurrentCard() {
        const { cards, currentCardIndex } = this.state;
        if (!cards || !cards.length) {
            console.error('updateCurrentCard: no cards available', { cards, currentCardIndex, state: this.state });
            return;
        }
        const idx = Math.max(0, Math.min(currentCardIndex, cards.length - 1));
        this.state.currentCardIndex = idx;
        this.state.currentCard = cards[idx];
        this.state.currentBackground = this.state.backgrounds[cards[idx].backgroundId] || null;
        this.cardlist?.refresh();
        this.paint?.loadCard();
        this.ui?.renderCard();
    },

    async goToCard(spec) {
        const { cards, currentCardIndex } = this.state;
        let idx = currentCardIndex;
        if (spec === 'back') {
            if (this.state.history.length > 0) {
                idx = this.state.history.pop();
            } else throw new Error("No cards in history to go back to.");
        } else if (spec === 'next') {
            if (idx >= cards.length - 1) throw new Error("Already at the last card.");
            idx++;
        }
        else if (spec === 'prev' || spec === 'previous') {
            if (idx <= 0) throw new Error("Already at the first card.");
            idx--;
        }
        else if (spec === 'first') idx = 0;
        else if (spec === 'last') idx = cards.length - 1;
        else if (typeof spec === 'number') {
            if (spec < 1 || spec > cards.length) throw new Error(`Card index ${spec} is out of range (1 to ${cards.length}).`);
            idx = spec - 1;
        }
        else {
            const found = cards.findIndex(c => c.name.toLowerCase() === String(spec).toLowerCase());
            if (found >= 0) idx = found;
            else throw new Error(`Could not find card named "${spec}".`);
        }

        if (idx === currentCardIndex) return;

        // closeCard
        await this.handleObjectEvent('closeCard', null);

        if (spec !== 'back') this.state.history.push(currentCardIndex);
        this.state.currentCardIndex = idx;
        this.updateCurrentCard();
        this.scheduleAutoSave();

        // openCard
        await this.handleObjectEvent('openCard', null);
    },

    setTool(tool) {
        const PAINT_TOOLS = ['pencil', 'spray', 'fill', 'eraser', 'line', 'rect', 'ellipse'];
        const wasPaint = PAINT_TOOLS.includes(this.state.tool);
        const isPaint = PAINT_TOOLS.includes(tool);
        if (wasPaint && !isPaint) this.paint?.deactivate();
        if (isPaint) this.paint?.activate(tool);
        this.state.tool = tool;
        this.state.mode = (tool === 'browse') ? 'browse' : 'edit';
        this.state.selectedObject = null;
        this.ui?.updateToolState();
        if (!isPaint) this.ui?.renderCard();
    },

    addObject(type, rect) {
        const card = this.state.currentCard;
        if (!card) return null;
        const obj = createObject({ type, rect });
        card.objects.push(obj);
        this.ui?.renderCard();
        this.scheduleAutoSave();
        return obj;
    },

    removeObject(objId) {
        const { currentCard, currentBackground } = this.state;
        if (currentCard) currentCard.objects = currentCard.objects.filter(o => o.id !== objId);
        if (currentBackground) currentBackground.objects = currentBackground.objects.filter(o => o.id !== objId);
        if (this.state.selectedObject?.id === objId) this.state.selectedObject = null;
        this.ui?.renderCard();
        this.scheduleAutoSave();
    },

    findObject(objId) {
        const { currentCard, currentBackground } = this.state;
        return (currentCard?.objects || []).find(o => o.id === objId)
            || (currentBackground?.objects || []).find(o => o.id === objId)
            || null;
    },

    findObjectByName(name, type) {
        const { currentCard, currentBackground } = this.state;
        const all = [...(currentCard?.objects || []), ...(currentBackground?.objects || [])];
        return all.find(o =>
            (!type || o.type === type) &&
            ((o.name && o.name.toLowerCase() === name.toLowerCase()) || o.id === name)
        ) || null;
    },

    addCard(afterIdx) {
        const { stack, backgrounds, cards, currentCardIndex, currentCard } = this.state;
        const bgId = currentCard?.backgroundId || Object.keys(backgrounds)[0];
        const insAt = afterIdx !== undefined ? afterIdx : currentCardIndex;
        const card = createCard({
            id: generateId('card'), stackId: stack.id, backgroundId: bgId,
            name: `Card ${cards.length + 1}`, number: cards.length + 1,
        });
        cards.splice(insAt + 1, 0, card);
        stack.cardIds = cards.map(c => c.id);
        cards.forEach((c, i) => c.number = i + 1);
        this.state.currentCardIndex = insAt + 1;
        this.updateCurrentCard();
        this.scheduleAutoSave();

        // Automatically open info dialog for the new card
        this.dialogs.openCardInfo();

        return card;
    },

    duplicateCard() {
        const { stack, cards, currentCardIndex, currentCard } = this.state;
        if (!currentCard) return null;

        const newCard = createCard({
            id: generateId('card'),
            stackId: stack.id,
            backgroundId: currentCard.backgroundId,
            name: `${currentCard.name} Copy`,
            number: cards.length + 1,
            script: currentCard.script,
            backgroundColor: currentCard.backgroundColor,
            backgroundImage: currentCard.backgroundImage
        });

        newCard.objects = currentCard.objects.map(obj => {
            const newObj = JSON.parse(JSON.stringify(obj));
            newObj.id = generateId(newObj.type);
            return newObj;
        });

        cards.splice(currentCardIndex + 1, 0, newCard);
        stack.cardIds = cards.map(c => c.id);
        cards.forEach((c, i) => c.number = i + 1);
        this.state.currentCardIndex = currentCardIndex + 1;
        this.updateCurrentCard();
        this.scheduleAutoSave();

        this.dialogs.openCardInfo();
        return newCard;
    },

    deleteCurrentCard() {
        const { cards, currentCardIndex } = this.state;
        if (cards.length <= 1) { alert('Cannot delete the only card.'); return; }
        cards.splice(currentCardIndex, 1);
        this.state.stack.cardIds = cards.map(c => c.id);
        cards.forEach((c, i) => c.number = i + 1);
        this.state.currentCardIndex = Math.min(currentCardIndex, cards.length - 1);
        this.updateCurrentCard();
        this.scheduleAutoSave();
    },

    // Message-passing hierarchy: object → card → background → stack → app
    async handleObjectEvent(eventName, objId) {
        const { currentCard, currentBackground, stack } = this.state;
        const obj = objId ? this.findObject(objId) : null;
        const targets = [obj, currentCard, currentBackground, stack].filter(Boolean);
        for (const target of targets) {
            const handled = await this.engine.dispatch(eventName, target.script || '', objId);
            if (handled) break;
        }
    },
};

window.HC = App;
App.init().catch(console.error);
