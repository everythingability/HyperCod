/**
 * Image Dithering Logic — HyperCode
 */

export class DitherProcessor {
    static algorithms = {
        'Atkinson': [
            [1, 0, 1 / 8], [2, 0, 1 / 8],
            [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8],
            [0, 2, 1 / 8]
        ],
        'Floyd-Steinberg': [
            [1, 0, 7 / 16],
            [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]
        ],
        'Burkes': [
            [1, 0, 8 / 32], [2, 0, 4 / 32],
            [-2, 1, 2 / 32], [-1, 1, 4 / 32], [0, 1, 8 / 32], [1, 1, 4 / 32], [2, 1, 2 / 32]
        ],
        'Stucki': [
            [1, 0, 8 / 42], [2, 0, 4 / 42],
            [-2, 1, 2 / 42], [-1, 1, 4 / 42], [0, 1, 8 / 42], [1, 1, 4 / 42], [2, 1, 2 / 42],
            [-2, 2, 1 / 42], [-1, 2, 2 / 42], [0, 2, 4 / 42], [1, 2, 2 / 42], [2, 2, 1 / 42]
        ],
        'Sierra': [
            [1, 0, 5 / 32], [2, 0, 3 / 32],
            [-2, 1, 2 / 32], [-1, 1, 4 / 32], [0, 1, 5 / 32], [1, 1, 4 / 32], [2, 1, 2 / 32],
            [-1, 2, 2 / 32], [0, 2, 3 / 32], [1, 2, 2 / 32]
        ]
    };

    static async process(img, options) {
        const { algo, brightness, contrast, pixelSize, desaturate } = options;

        // Create source canvas
        const canvas = document.createElement('canvas');
        const w = Math.max(1, Math.floor(img.width / pixelSize));
        const h = Math.max(1, Math.floor(img.height / pixelSize));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        // 1. Adjustment factors
        const b = brightness / 100;
        const c = contrast / 100;
        const contrastFactor = (259 * (c + 255)) / (255 * (259 - c));

        // 2. Pre-process (Brightness, Contrast, Grayscale)
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i], g = data[i + 1], bVal = data[i + 2];

            // Contrast & Brightness
            r = contrastFactor * (r - 128) + 128 + b * 255;
            g = contrastFactor * (g - 128) + 128 + b * 255;
            bVal = contrastFactor * (bVal - 128) + 128 + b * 255;

            if (desaturate) {
                const gray = 0.299 * r + 0.587 * g + 0.114 * bVal;
                r = g = bVal = gray;
            }

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, bVal));
        }

        // 3. Dither
        if (algo !== 'none') {
            const matrix = this.algorithms[algo] || this.algorithms['Atkinson'];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const oldR = data[idx];
                    const oldG = data[idx + 1];
                    const oldB = data[idx + 2];

                    // Simple threshold for B&W
                    const newR = oldR < 128 ? 0 : 255;
                    const newG = oldG < 128 ? 0 : 255;
                    const newB = oldB < 128 ? 0 : 255;

                    data[idx] = newR;
                    data[idx + 1] = newG;
                    data[idx + 2] = newB;

                    const errR = oldR - newR;
                    const errG = oldG - newG;
                    const errB = oldB - newB;

                    for (const [dx, dy, weight] of matrix) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            const nidx = (ny * w + nx) * 4;
                            data[nidx] += errR * weight;
                            data[nidx + 1] += errG * weight;
                            data[nidx + 2] += errB * weight;
                        }
                    }
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Upscale if pixelSize > 1
        if (pixelSize > 1) {
            const outCanvas = document.createElement('canvas');
            outCanvas.width = img.width;
            outCanvas.height = img.height;
            const outCtx = outCanvas.getContext('2d');
            outCtx.imageSmoothingEnabled = false;
            outCtx.drawImage(canvas, 0, 0, img.width, img.height);
            return outCanvas.toDataURL('image/png');
        }

        return canvas.toDataURL('image/png');
    }
}
