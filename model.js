/**
 * Data model factories — HyperCard PWA
 */

let _seq = Date.now();
export function generateId(prefix = 'obj') {
    return `${prefix}-${(++_seq).toString(36)}`;
}

export function createStack(p = {}) {
    return {
        id: p.id || generateId('stack'),
        name: p.name || 'Untitled Stack',
        script: p.script || '',
        cardSize: p.cardSize || { width: 1200, height: 800 },
        cardIds: p.cardIds || [],
        backgroundIds: p.backgroundIds || [],
        createdAt: p.createdAt || Date.now(),
        backdropColor: p.backdropColor || '#e0e0e0',
        backgroundColor: p.backgroundColor || '#ffffff',
        pattern: p.pattern || 'none',
        patternColor: p.patternColor || '#d0d0d0',
        style: p.style || 'rectangle',
        isTransparent: p.isTransparent || false,
        backgroundImage: p.backgroundImage || null,
    };
}

export function createBackground(p = {}) {
    return {
        id: p.id || generateId('bg'),
        stackId: p.stackId || '',
        name: p.name || 'Background 1',
        script: p.script || '',
        backgroundColor: p.backgroundColor || '#ffffff',
        backgroundImage: p.backgroundImage || null,
        objects: p.objects || [],
        isTransparent: p.isTransparent || false,
    };
}

export function createCard(p = {}) {
    return {
        id: p.id || generateId('card'),
        stackId: p.stackId || '',
        backgroundId: p.backgroundId || '',
        name: p.name || 'Untitled Card',
        number: p.number || 1,
        script: p.script || '',
        backgroundColor: p.backgroundColor || null,
        backgroundImage: p.backgroundImage || null,
        objects: p.objects || [],
        isTransparent: p.isTransparent || false,
    };
}

export function createObject(p = {}) {
    const type = p.type || 'button';
    const defW = type === 'embed' ? 560 : type === 'emoji' ? 80 : type === 'button' ? 130 : 200;
    const defH = type === 'embed' ? 315 : type === 'emoji' ? 80 : type === 'button' ? 36 : 100;
    const base = {
        id: p.id || generateId(type),
        type,
        name: p.name || _defaultName(type),
        rect: p.rect || { x: 80, y: 80, width: defW, height: defH },
        visible: p.visible !== false,
        hideOnHome: p.hideOnHome || false,
        script: p.script || '',
        layer: p.layer || 'card',
        rotation: p.rotation || 0,
    };

    if (type === 'button') {
        return {
            ...base,
            title: p.title !== undefined ? p.title : base.name,
            style: p.style || 'roundrect',
            textColor: p.textColor || '#000000',
            fillColor: p.fillColor || '#dddddd',
            fontSize: p.fontSize || 16,
            fontFamily: p.fontFamily || 'system-ui,sans-serif',
            enabled: p.enabled !== false,
            autoHilite: p.autoHilite !== false,
        };
    }
    if (type === 'field') {
        return {
            ...base,
            content: p.content || '',
            style: p.style || 'rectangle',
            textColor: p.textColor || '#000000',
            fillColor: p.fillColor || '#ffffff',
            fontSize: p.fontSize || 16,
            fontFamily: p.fontFamily || 'system-ui,sans-serif',
            editable: p.editable !== false,
            lockText: p.lockText || false,
            multiLine: p.multiLine !== false,
            allowLinks: p.allowLinks !== false,
        };
    }
    if (type === 'image') {
        return {
            ...base,
            src: p.src || '',
            alt: p.alt || '',
            fit: p.fit || 'cover',
        };
    }
    if (type === 'audio') {
        return {
            ...base,
            src: p.src || '',
            controls: true,
            autoplay: false,
            loop: false,
        };
    }
    if (type === 'embed') {
        return {
            ...base,
            htmlCode: p.htmlCode || '<iframe src="https://example.com" width="100%" height="100%" frameborder="0"></iframe>',
        };
    }
    if (type === 'emoji') {
        return {
            ...base,
            emoji: p.emoji || '🚀',
        };
    }
    return base;
}

function _defaultName(type) {
    return { button: 'New Button', field: 'New Field', image: 'New Image', audio: 'New Audio', embed: 'New Embed', emoji: 'New Emoji' }[type] || 'Object';
}
