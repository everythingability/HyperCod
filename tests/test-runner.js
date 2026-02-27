/**
 * Simple Test Runner for HyperCod
 */
export class TestRunner {
    constructor() {
        this.tests = [];
        this.results = [];
    }

    add(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        this.results = [];
        for (const test of this.tests) {
            try {
                await test.fn();
                this.results.push({ name: test.name, passed: true });
            } catch (err) {
                console.error(`Test failed: ${test.name}`, err);
                this.results.push({ name: test.name, passed: false, error: err.message });
            }
        }
        return this.results;
    }

    render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        const summary = document.createElement('div');
        const passedCount = this.results.filter(r => r.passed).length;
        summary.innerHTML = `<h3>Test Results: ${passedCount}/${this.results.length} Passed</h3>`;
        container.appendChild(summary);

        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';

        this.results.forEach(res => {
            const item = document.createElement('li');
            item.style.padding = '5px';
            item.style.marginBottom = '5px';
            item.style.borderLeft = `5px solid ${res.passed ? 'green' : 'red'}`;
            item.style.backgroundColor = res.passed ? '#e6ffe6' : '#ffe6e6';
            item.innerHTML = `<strong>${res.passed ? '✓' : '✗'} ${res.name}</strong> ${res.passed ? '' : `<br><small>${res.error}</small>`}`;
            list.appendChild(item);
        });
        container.appendChild(list);
    }
}

export function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

export function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, but got ${actual}`);
    }
}
