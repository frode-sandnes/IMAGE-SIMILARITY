// --- 1. CORE MATHEMATICAL HELPERS ---

const sum2d = (img) => img.data.reduce((a, b) => a + b, 0);
const mean2d = (img) => sum2d(img) / img.data.length;

const op2d = (img1, img2, op) => {
    const isNum = typeof img2 === 'number';
    const data = img1.data.map((val, i) => op(val, isNum ? img2 : img2.data[i]));
    return { data, width: img1.width, height: img1.height };
};

const add2d = (img1, img2) => op2d(img1, img2, (a, b) => a + b);
const sub2d = (img1, img2) => op2d(img1, img2, (a, b) => a - b);
const mul2d = (img1, img2) => op2d(img1, img2, (a, b) => a * b);
const div2d = (img1, img2) => op2d(img1, img2, (a, b) => a / b);
const sqr2d = (img) => mul2d(img, img);

// --- 2. IMAGE PROCESSING ---

/**
 * Converts RGBA Uint8ClampedArray to Grayscale intensities
 */
function rgb2gray({ data, width, height }) {
    const gray = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        // Standard Luma Transform
        gray[i / 4] = (0.29894 * data[i] + 0.58704 * data[i + 1] + 0.11402 * data[i + 2]);
    }
    return { data: gray, width, height };
}

/**
 * Modern Image Loader with Uint8ClampedArray enforcement
 * Replaces legacy 'readpixels'
 */
async function getPixels(src, maxSize = 256) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Calculate dimensions based on maxSize
            let { width, height } = img;
            if (maxSize && (width > maxSize || height > maxSize)) {
                const ratio = width / height;
                if (ratio > 1) {
                    width = maxSize;
                    height = Math.round(maxSize / ratio);
                } else {
                    height = maxSize;
                    width = Math.round(maxSize * ratio);
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Returns ImageData containing Uint8ClampedArray
            const imageData = ctx.getImageData(0, 0, width, height);
            resolve(rgb2gray(imageData));
        };

        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

// --- 3. SSIM IMPLEMENTATION ---

/**
 * Calculates the Structural Similarity Index
 */
async function ssim(url1, url2, options = {}) {
    const { 
        k1 = 0.01, 
        k2 = 0.03, 
        bitDepth = 8, 
        maxSize = 256 
    } = options;

    // Load and Validate
    const [img1, img2] = await Promise.all([
        getPixels(url1, maxSize),
        getPixels(url2, maxSize)
    ]);

    if (img1.width !== img2.width || img1.height !== img2.height) {
        throw new Error("Image dimensions must match for SSIM calculation.");
    }

    // Constants
    const L = Math.pow(2, bitDepth) - 1;
    const c1 = Math.pow(k1 * L, 2);
    const c2 = Math.pow(k2 * L, 2);

    // Structural Statistics
    const mu1 = mean2d(img1);
    const mu2 = mean2d(img2);
    const mu1_sq = mu1 * mu1;
    const mu2_sq = mu2 * mu2;
    const mu1_mu2 = mu1 * mu2;

    const sigma1_sq = mean2d(sqr2d(img1)) - mu1_sq;
    const sigma2_sq = mean2d(sqr2d(img2)) - mu2_sq;
    const sigma12 = mean2d(mul2d(img1, img2)) - mu1_mu2;

    // SSIM Formula
    const numerator = (2 * mu1_mu2 + c1) * (2 * sigma12 + c2);
    const denominator = (mu1_sq + mu2_sq + c1) * (sigma1_sq + sigma2_sq + c2);

    return {
        mssim: numerator / denominator,
        width: img1.width,
        height: img1.height
    };
}