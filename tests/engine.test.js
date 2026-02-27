import { ScriptEngine } from '../engine.js';
import { assert, assertEquals } from './test-runner.js';

export function registerEngineTests(runner) {
    const mockApp = {
        state: {
            it: '',
            cards: [{ id: 'c1', name: 'Home', number: 1, objects: [] }],
            currentCard: { id: 'c1', name: 'Home', number: 1, objects: [] },
            stack: { id: 's1', name: 'Test Stack' }
        },
        ui: {
            renderCard: () => { }
        },
        dialogs: {
            alert: (title, msg) => { console.log('ALERTMOCK:', msg); }
        },
        scheduleAutoSave: () => { },
        findObjectByName: (name, type) => {
            if (name === 'News' && type === 'field') {
                return { id: 'f1', type: 'field', name: 'News', content: '' };
            }
            return null;
        },
        goToCard: async (spec) => {
            mockApp.state.lastGoTo = spec;
        }
    };

    const engine = new ScriptEngine(mockApp);

    runner.add('HyperTalk: put into it', async () => {
        await engine.dispatch('mouseUp', 'on mouseUp\nput "hello" into it\nend mouseUp');
        assertEquals(mockApp.state.it, 'hello');
    });

    runner.add('HyperTalk: go to next', async () => {
        await engine.dispatch('mouseUp', 'on mouseUp\ngo to next\nend mouseUp');
        assertEquals(mockApp.state.lastGoTo, 'next');
    });

    runner.add('HyperTalk: put before/after it', async () => {
        mockApp.state.it = "world";
        await engine.dispatch('mouseUp', 'on mouseUp\nput "hello " before it\nput "!" after it\nend mouseUp');
        assertEquals(mockApp.state.it, 'hello world!');
    });

    runner.add('HyperTalk: set property of object', async () => {
        const btn = { id: 'b1', type: 'button', name: 'MyButton', title: 'Old Title' };
        mockApp.state.currentCard.objects.push(btn);
        // We need to mock findObjectByName to find this button too
        const oldFind = mockApp.findObjectByName;
        mockApp.findObjectByName = (name, type) => {
            if (name === 'MyButton') return btn;
            return oldFind(name, type);
        };
        await engine.dispatch('mouseUp', 'on mouseUp\nset the title of button "MyButton" to "New Title"\nend mouseUp');
        assertEquals(btn.title, 'New Title');
        mockApp.findObjectByName = oldFind;
    });

    runner.add('JS Mode: findObjectByName and set content', async () => {
        const script = `// @javascript
        const field = app.findObjectByName("News", "field");
        if (field) {
            field.content = "News Update";
        }`;
        await engine.dispatch('mouseUp', script);

        const field = mockApp.findObjectByName('News', 'field');
        assertEquals(field.content, 'News Update');
    });

    runner.add('JS Mode: async fetch (mocked)', async () => {
        const oldFetch = window.fetch;
        window.fetch = async () => ({
            text: async () => "Mocked Content"
        });
        try {
            const script = `// @javascript
            const response = await fetch("https://example.com");
            const text = await response.text();
            app.state.it = text;`;
            await engine.dispatch('mouseUp', script);
            assertEquals(mockApp.state.it, 'Mocked Content');
        } finally {
            window.fetch = oldFetch;
        }
    });

    runner.add('HyperTalk: find text across cards', async () => {
        const card1 = { id: 'c1', objects: [] };
        const card2 = { id: 'c2', objects: [{ id: 'f1', type: 'field', name: 'NemoField', content: 'Finding Nemo' }] };
        mockApp.state.cards = [card1, card2];
        mockApp.state.backgrounds = { 'bg1': { objects: [] } };
        card1.backgroundId = 'bg1';
        card2.backgroundId = 'bg1';
        mockApp.state.currentCardIndex = 0;

        await engine.exec('find "Nemo"');
        assertEquals(mockApp.state.lastGoTo, 2); // Card index + 1
        assertEquals(mockApp.state.it, 'Finding Nemo');
    });

    runner.add('HyperTalk: find in field specifier', async () => {
        const card1 = { id: 'c1', backgroundId: 'bg1', objects: [{ id: 'f2', type: 'field', name: 'Other', content: 'Nemo' }] };
        const card2 = { id: 'c2', backgroundId: 'bg1', objects: [{ id: 'f1', type: 'field', name: 'Target', content: 'Nemo' }] };
        mockApp.state.cards = [card1, card2];
        mockApp.state.currentCardIndex = 0;

        await engine.exec('find "Nemo" in field "Target"');
        assertEquals(mockApp.state.lastGoTo, 2);
    });
}
