class StrokeAnimation {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        this.isPlaying = false;
        this.isPaused = false;
        this.currentProgress = 0;
        this.speed = 1;
        this.strokeWidth = 1;
        
        this.animationId = null;
        this.lastTime = 0;
        
        this.pageStrokes = [];
        this.totalStrokeLength = 0;
        this.currentStrokeIndex = 0;
        this.currentStrokeProgress = 0;
        
        this.currentPage = 0;
        this.strokeCache = new Map();
        this.maxCacheSize = 300;
        
        this.options = {
            text: '',
            fontFamily: '"KaiTi", "STKaiti", "楷体", serif',
            fontSize: 32,
            charSpacing: 2,
            lineHeight: 1.8,
            slantAngle: 0,
            inkDensity: 80,
            randomOffset: 3,
            strokeNoise: 30,
            pageWidth: 800,
            pageHeight: 1150,
            padding: 60,
            paperColor: '#faf8f0',
            inkColor: '#2c2c2c',
            weight: 'normal'
        };
        
        this.seed = Math.random();
        this.onProgress = null;
        this.onComplete = null;
        this.onReady = null;
    }

    setOptions(options) {
        Object.assign(this.options, options);
        this.seed = Math.random();
        this.clearCache();
    }

    clearCache() {
        this.strokeCache.clear();
        this.pageStrokes = [];
    }

    seededRandom(seed) {
        const x = Math.sin(seed * 9999) * 10000;
        return x - Math.floor(x);
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    decomposeCharStrokes(char, charIndex, lineIndex, x, y) {
        const cacheKey = `${char}_${this.options.fontSize}_${this.options.fontFamily}_${this.options.weight}_${this.seed}`;
        
        if (this.strokeCache.has(cacheKey)) {
            const cached = this.strokeCache.get(cacheKey);
            return cached.map(stroke => ({
                points: stroke.points.map(p => ({ x: p.x + x, y: p.y + y })),
                length: stroke.length
            }));
        }

        const fontSize = this.options.fontSize;
        const padding = Math.ceil(fontSize * 0.3);
        const canvasWidth = Math.ceil(fontSize * 1.5) + padding * 2;
        const canvasHeight = Math.ceil(fontSize * 1.5) + padding * 2;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');

        const offset = this.randomOffsetForChar(charIndex, lineIndex, this.seed, this.options.randomOffset);
        const rotation = this.randomRotationForChar(charIndex, lineIndex, this.seed);
        const slantRad = (this.options.slantAngle + rotation) * Math.PI / 180;

        tempCtx.save();
        tempCtx.translate(padding, padding);
        tempCtx.transform(1, 0, Math.tan(slantRad), 1, 0, 0);
        tempCtx.font = `${this.options.weight} ${fontSize}px ${this.options.fontFamily}`;
        tempCtx.textBaseline = 'top';
        tempCtx.fillStyle = '#000';
        tempCtx.fillText(char, offset.x, offset.y);
        tempCtx.restore();

        const strokes = this.extractStrokesFromCanvas(tempCtx, canvasWidth, canvasHeight);

        const resultStrokes = strokes.map(stroke => ({
            points: stroke.points.map(p => ({ x: p.x + x - padding, y: p.y + y - padding })),
            length: stroke.length
        }));

        if (this.strokeCache.size < this.maxCacheSize) {
            this.strokeCache.set(cacheKey, strokes.map(s => ({
                points: s.points.map(p => ({ ...p })),
                length: s.length
            })));
        }

        return resultStrokes;
    }

    randomOffsetForChar(charIndex, lineIndex, seed, randomOffset) {
        const offsetSeed = seed + charIndex * 1000 + lineIndex * 10000;
        const offsetX = (this.seededRandom(offsetSeed) - 0.5) * 2 * randomOffset;
        const offsetY = (this.seededRandom(offsetSeed + 100) - 0.5) * 2 * randomOffset;
        return { x: offsetX, y: offsetY };
    }

    randomRotationForChar(charIndex, lineIndex, seed) {
        const rotationSeed = seed + charIndex * 2000 + lineIndex * 20000;
        return (this.seededRandom(rotationSeed) - 0.5) * 2.5;
    }

    extractStrokesFromCanvas(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        
        const edgePoints = this.detectEdges(pixels, width, height);
        const strokes = this.traceStrokes(edgePoints, width, height);
        
        return strokes;
    }

    detectEdges(pixels, width, height) {
        const edges = [];
        const threshold = 50;
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                const alpha = pixels[idx + 3];
                
                if (alpha < threshold) continue;
                
                const leftIdx = (y * width + (x - 1)) * 4;
                const rightIdx = (y * width + (x + 1)) * 4;
                const topIdx = ((y - 1) * width + x) * 4;
                const bottomIdx = ((y + 1) * width + x) * 4;
                
                const leftAlpha = pixels[leftIdx + 3];
                const rightAlpha = pixels[rightIdx + 3];
                const topAlpha = pixels[topIdx + 3];
                const bottomAlpha = pixels[bottomIdx + 3];
                
                const isEdge = Math.abs(alpha - leftAlpha) > 30 ||
                              Math.abs(alpha - rightAlpha) > 30 ||
                              Math.abs(alpha - topAlpha) > 30 ||
                              Math.abs(alpha - bottomAlpha) > 30;
                
                if (isEdge) {
                    edges.push({
                        x,
                        y,
                        alpha,
                        visited: false
                    });
                }
            }
        }
        
        return edges;
    }

    traceStrokes(edgePoints, width, height) {
        if (edgePoints.length === 0) return [];

        const strokes = [];
        const gridSize = Math.max(2, Math.floor(this.options.fontSize / 25));
        const grid = new Map();

        for (const point of edgePoints) {
            const gridX = Math.floor(point.x / gridSize);
            const gridY = Math.floor(point.y / gridSize);
            const key = `${gridX},${gridY}`;
            if (!grid.has(key)) {
                grid.set(key, []);
            }
            grid.get(key).push(point);
        }

        const unvisited = edgePoints.filter(p => !p.visited);
        
        while (unvisited.length > 0) {
            let startIdx = 0;
            let minY = Infinity;
            let minX = Infinity;
            
            for (let i = 0; i < unvisited.length; i++) {
                const p = unvisited[i];
                if (p.visited) continue;
                if (p.y < minY || (p.y === minY && p.x < minX)) {
                    minY = p.y;
                    minX = p.x;
                    startIdx = i;
                }
            }

            const startPoint = unvisited[startIdx];
            if (startPoint.visited) {
                unvisited.splice(startIdx, 1);
                continue;
            }

            const strokePoints = this.traceSingleStroke(startPoint, grid, gridSize);
            
            if (strokePoints.length >= 2) {
                const simplified = this.simplifyStroke(strokePoints, 1.5);
                const length = this.calculateStrokeLength(simplified);
                
                if (length > 5) {
                    strokes.push({
                        points: simplified,
                        length
                    });
                }
            }

            for (let i = unvisited.length - 1; i >= 0; i--) {
                if (unvisited[i].visited) {
                    unvisited.splice(i, 1);
                }
            }
        }

        strokes.sort((a, b) => {
            const aFirst = a.points[0];
            const bFirst = b.points[0];
            if (Math.abs(aFirst.y - bFirst.y) > this.options.fontSize * 0.15) {
                return aFirst.y - bFirst.y;
            }
            return aFirst.x - bFirst.x;
        });

        return strokes;
    }

    traceSingleStroke(startPoint, grid, gridSize) {
        const points = [];
        let current = startPoint;
        const maxPoints = 1000;
        let count = 0;

        const searchRadius = Math.max(4, this.options.fontSize / 12);

        while (current && count < maxPoints) {
            points.push({ x: current.x, y: current.y });
            current.visited = true;
            count++;

            let next = null;
            let bestScore = -Infinity;

            const gx = Math.floor(current.x / gridSize);
            const gy = Math.floor(current.y / gridSize);

            for (let dgx = -2; dgx <= 2; dgx++) {
                for (let dgy = -2; dgy <= 2; dgy++) {
                    const key = `${gx + dgx},${gy + dgy}`;
                    const cell = grid.get(key);
                    if (!cell) continue;

                    for (const p of cell) {
                        if (p.visited) continue;

                        const dx = p.x - current.x;
                        const dy = p.y - current.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist > searchRadius || dist < 1) continue;

                        const prevPoint = points.length > 1 ? points[points.length - 2] : null;
                        let directionScore = 0;
                        
                        if (prevPoint) {
                            const prevDx = current.x - prevPoint.x;
                            const prevDy = current.y - prevPoint.y;
                            const prevLen = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
                            const curLen = dist;
                            
                            if (prevLen > 0 && curLen > 0) {
                                const dot = (prevDx * dx + prevDy * dy) / (prevLen * curLen);
                                directionScore = dot * 2;
                            }
                        }

                        const downwardBonus = dy > 0 ? 0.5 : 0;
                        const rightwardBonus = dx > 0 ? 0.3 : 0;
                        
                        const score = -dist + directionScore + downwardBonus + rightwardBonus;

                        if (score > bestScore) {
                            bestScore = score;
                            next = p;
                        }
                    }
                }
            }

            if (next) {
                next.visited = true;
            }

            current = next;
        }

        return points;
    }

    simplifyStroke(points, tolerance) {
        if (points.length <= 2) return points;

        const result = [points[0]];
        let last = points[0];

        for (let i = 1; i < points.length - 1; i++) {
            const dx = points[i].x - last.x;
            const dy = points[i].y - last.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist >= tolerance) {
                result.push(points[i]);
                last = points[i];
            }
        }

        if (points.length > 0) {
            result.push(points[points.length - 1]);
        }

        return result;
    }

    calculateStrokeLength(points) {
        let length = 0;
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            length += Math.sqrt(dx * dx + dy * dy);
        }
        return length;
    }

    splitTextIntoLines(text, maxWidth) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.font = `${this.options.weight} ${this.options.fontSize}px ${this.options.fontFamily}`;

        const paragraphs = text.split('\n');
        const lines = [];

        for (const paragraph of paragraphs) {
            if (paragraph === '') {
                lines.push('');
                continue;
            }

            let currentLine = '';
            let currentWidth = 0;

            for (let i = 0; i < paragraph.length; i++) {
                const char = paragraph[i];
                const charWidth = tempCtx.measureText(char).width + this.options.charSpacing;

                if (currentWidth + charWidth > maxWidth && currentLine !== '') {
                    lines.push(currentLine);
                    currentLine = char;
                    currentWidth = charWidth;
                } else {
                    currentLine += char;
                    currentWidth += charWidth;
                }
            }

            if (currentLine !== '') {
                lines.push(currentLine);
            }
        }

        return lines;
    }

    calculatePageChars() {
        const { pageWidth, pageHeight, padding, lineHeight, fontSize } = this.options;
        const contentWidth = pageWidth - padding * 2;
        const contentHeight = pageHeight - padding * 2;
        const lineHeightPx = fontSize * lineHeight;

        const lines = this.splitTextIntoLines(this.options.text, contentWidth);
        const linesPerPage = Math.floor(contentHeight / lineHeightPx);

        const pages = [];
        for (let i = 0; i < lines.length; i += linesPerPage) {
            pages.push(lines.slice(i, i + linesPerPage));
        }

        if (pages.length === 0) {
            pages.push([]);
        }

        return pages;
    }

    async preparePageStrokes(pageIndex) {
        const pages = this.calculatePageChars();
        if (pageIndex >= pages.length) {
            pageIndex = pages.length - 1;
        }

        this.currentPage = pageIndex;
        const pageLines = pages[pageIndex];
        const { fontSize, lineHeight, padding, charSpacing } = this.options;
        const lineHeightPx = fontSize * lineHeight;
        const startY = padding;

        let charIndexOffset = 0;
        for (let i = 0; i < pageIndex; i++) {
            charIndexOffset += pages[i].reduce((sum, line) => sum + line.length, 0);
        }

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.font = `${this.options.weight} ${fontSize}px ${this.options.fontFamily}`;

        this.pageStrokes = [];
        let charCount = 0;
        let totalLength = 0;

        for (let lineIndex = 0; lineIndex < pageLines.length; lineIndex++) {
            const line = pageLines[lineIndex];
            const y = startY + lineIndex * lineHeightPx;
            let x = padding;

            for (let charIndex = 0; charIndex < line.length; charIndex++) {
                const char = line[charIndex];
                const globalCharIndex = charIndexOffset + charCount;

                const strokes = this.decomposeCharStrokes(char, globalCharIndex, lineIndex, x, y);
                
                for (const stroke of strokes) {
                    totalLength += stroke.length;
                    this.pageStrokes.push(stroke);
                }

                const charWidth = tempCtx.measureText(char).width + charSpacing;
                x += charWidth;
                charCount++;

                if (charCount % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }

        this.totalStrokeLength = totalLength;
        this.currentStrokeIndex = 0;
        this.currentStrokeProgress = 0;
        this.currentProgress = 0;

        return totalLength;
    }

    getPointAtProgress(stroke, progress) {
        const points = stroke.points;
        if (points.length < 2) return points[0] || { x: 0, y: 0 };

        const targetLength = stroke.length * progress;
        let currentLength = 0;

        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            const segLength = Math.sqrt(dx * dx + dy * dy);

            if (currentLength + segLength >= targetLength) {
                const t = (targetLength - currentLength) / segLength;
                return {
                    x: points[i - 1].x + dx * t,
                    y: points[i - 1].y + dy * t
                };
            }

            currentLength += segLength;
        }

        return points[points.length - 1];
    }

    play() {
        if (this.isPlaying && !this.isPaused) return;

        this.isPlaying = true;
        this.isPaused = false;
        this.lastTime = performance.now();
        this.animate();
    }

    pause() {
        this.isPaused = true;
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.currentProgress = 0;
        this.currentStrokeIndex = 0;
        this.currentStrokeProgress = 0;
    }

    reset() {
        this.stop();
        this.clearCanvas();
        this.drawPaperBackground();
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawPaperBackground() {
        PaperEffects.addPaperTexture(this.ctx, this.canvas.width, this.canvas.height, this.options.paperColor, this.seed);
        PaperEffects.addPaperFiberEffect(this.ctx, this.canvas.width, this.canvas.height, this.options.paperColor, this.seed);
    }

    animate() {
        if (!this.isPlaying || this.isPaused) return;

        const now = performance.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;

        const baseSpeed = 80 * this.options.fontSize / 32;
        const pixelsPerSecond = baseSpeed * this.speed;
        const deltaLength = pixelsPerSecond * deltaTime;

        this.advanceStroke(deltaLength);
        this.render();

        if (this.onProgress) {
            const progress = this.totalStrokeLength > 0 
                ? this.getTotalProgress() 
                : 0;
            this.onProgress(progress);
        }

        if (this.currentStrokeIndex >= this.pageStrokes.length) {
            this.isPlaying = false;
            if (this.onComplete) {
                this.onComplete();
            }
            return;
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    advanceStroke(deltaLength) {
        if (this.pageStrokes.length === 0) return;
        if (this.currentStrokeIndex >= this.pageStrokes.length) return;

        let remaining = deltaLength;

        while (remaining > 0 && this.currentStrokeIndex < this.pageStrokes.length) {
            const stroke = this.pageStrokes[this.currentStrokeIndex];
            const strokeLen = stroke.length;
            const remainingInStroke = strokeLen * (1 - this.currentStrokeProgress);

            if (remaining < remainingInStroke) {
                this.currentStrokeProgress += remaining / strokeLen;
                remaining = 0;
            } else {
                remaining -= remainingInStroke;
                this.currentStrokeIndex++;
                this.currentStrokeProgress = 0;
            }
        }
    }

    getTotalProgress() {
        if (this.totalStrokeLength === 0) return 0;

        let completed = 0;
        for (let i = 0; i < this.currentStrokeIndex; i++) {
            completed += this.pageStrokes[i].length;
        }
        if (this.currentStrokeIndex < this.pageStrokes.length) {
            completed += this.pageStrokes[this.currentStrokeIndex].length * this.currentStrokeProgress;
        }

        return completed / this.totalStrokeLength;
    }

    setProgress(progress) {
        progress = Math.max(0, Math.min(1, progress));
        
        const targetLength = this.totalStrokeLength * progress;
        let accumulated = 0;

        this.currentStrokeIndex = 0;
        this.currentStrokeProgress = 0;

        for (let i = 0; i < this.pageStrokes.length; i++) {
            const len = this.pageStrokes[i].length;
            if (accumulated + len >= targetLength) {
                this.currentStrokeIndex = i;
                this.currentStrokeProgress = (targetLength - accumulated) / len;
                break;
            }
            accumulated += len;
            this.currentStrokeIndex = i + 1;
        }

        if (this.currentStrokeIndex >= this.pageStrokes.length) {
            this.currentStrokeIndex = this.pageStrokes.length - 1;
            this.currentStrokeProgress = 1;
        }

        this.currentProgress = progress;
        this.render();
    }

    setSpeed(speed) {
        this.speed = Math.max(0.1, Math.min(10, speed));
    }

    setStrokeWidth(width) {
        this.strokeWidth = Math.max(0.5, Math.min(10, width));
    }

    render() {
        this.clearCanvas();
        this.drawPaperBackground();

        if (this.pageStrokes.length === 0) return;

        const inkRgb = this.hexToRgb(this.options.inkColor);
        const baseAlpha = 0.55 + (this.options.inkDensity / 100) * 0.45;
        const lineWidth = this.strokeWidth * (this.options.fontSize / 32) * 1.8;

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.miterLimit = 10;

        for (let i = 0; i < this.currentStrokeIndex; i++) {
            this.drawFullStroke(this.pageStrokes[i], inkRgb, baseAlpha, lineWidth);
        }

        if (this.currentStrokeIndex < this.pageStrokes.length && this.currentStrokeProgress > 0) {
            this.drawPartialStroke(
                this.pageStrokes[this.currentStrokeIndex], 
                this.currentStrokeProgress, 
                inkRgb, 
                baseAlpha,
                lineWidth
            );
        }
    }

    drawFullStroke(stroke, inkRgb, baseAlpha, lineWidth) {
        const points = stroke.points;
        if (points.length < 2) return;

        this.ctx.strokeStyle = `rgba(${inkRgb.r}, ${inkRgb.g}, ${inkRgb.b}, ${baseAlpha})`;
        this.ctx.lineWidth = lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.stroke();

        this.ctx.strokeStyle = `rgba(${inkRgb.r}, ${inkRgb.g}, ${inkRgb.b}, ${baseAlpha * 0.4})`;
        this.ctx.lineWidth = lineWidth * 0.6;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.stroke();
    }

    drawPartialStroke(stroke, progress, inkRgb, baseAlpha, lineWidth) {
        const points = stroke.points;
        if (points.length < 2) return;

        const targetLength = stroke.length * progress;
        let currentLength = 0;

        this.ctx.strokeStyle = `rgba(${inkRgb.r}, ${inkRgb.g}, ${inkRgb.b}, ${baseAlpha})`;
        this.ctx.lineWidth = lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            const segLength = Math.sqrt(dx * dx + dy * dy);

            if (currentLength + segLength >= targetLength) {
                const t = (targetLength - currentLength) / segLength;
                const endX = points[i - 1].x + dx * t;
                const endY = points[i - 1].y + dy * t;
                this.ctx.lineTo(endX, endY);
                break;
            }

            this.ctx.lineTo(points[i].x, points[i].y);
            currentLength += segLength;
        }
        this.ctx.stroke();

        currentLength = 0;
        this.ctx.strokeStyle = `rgba(${inkRgb.r}, ${inkRgb.g}, ${inkRgb.b}, ${baseAlpha * 0.4})`;
        this.ctx.lineWidth = lineWidth * 0.6;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            const segLength = Math.sqrt(dx * dx + dy * dy);

            if (currentLength + segLength >= targetLength) {
                const t = (targetLength - currentLength) / segLength;
                const endX = points[i - 1].x + dx * t;
                const endY = points[i - 1].y + dy * t;
                this.ctx.lineTo(endX, endY);
                break;
            }

            this.ctx.lineTo(points[i].x, points[i].y);
            currentLength += segLength;
        }
        this.ctx.stroke();
    }

    async playPage(pageIndex = 0) {
        this.stop();
        this.canvas.width = this.options.pageWidth;
        this.canvas.height = this.options.pageHeight;
        this.drawPaperBackground();
        
        await this.preparePageStrokes(pageIndex);
        
        if (this.onReady) {
            this.onReady();
        }
        
        this.play();
    }

    getPageCount() {
        return this.calculatePageChars().length;
    }

    dispose() {
        this.stop();
        this.clearCache();
        this.pageStrokes = [];
    }
}

if (typeof window !== 'undefined') {
    window.StrokeAnimation = StrokeAnimation;
}
