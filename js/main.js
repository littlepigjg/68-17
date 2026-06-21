class HandwritingApp {
    constructor() {
        this.canvas = document.getElementById('previewCanvas');
        this.renderer = new HandwritingRenderer(this.canvas);
        this.strokeAnimation = new StrokeAnimation(this.canvas);
        this.exportManager = new ExportManager();
        this.exportHandlers = new ExportHandlers(this);
        this.eventHandlers = new EventHandlers(this);
        this.fontManager = new FontManager();
        
        this.currentStyle = 'kaishu';
        this.customFontFamily = null;
        this.debounceTimer = null;
        this.isAnimationMode = false;
        this.animationPage = 0;
        
        this.init();
    }

    async init() {
        this.showLoading();
        
        try {
            await FontLoader.loadAllFonts();
            console.log('所有字体预加载完成');
        } catch (error) {
            console.warn('预加载字体失败:', error);
        }
        
        this.eventHandlers.bindAll();
        await this.eventHandlers.applyStyle('kaishu');
        this.generatePreview();
        
        this.hideLoading();
    }

    debouncedGenerate() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.generatePreview();
        }, 150);
    }

    generatePreview() {
        if (this.isAnimationMode) {
            this.stopAnimation();
            this.isAnimationMode = false;
        }
        
        const text = document.getElementById('textInput').value;
        this.renderer.setOptions({ text });
        
        this.showLoading();
        
        requestAnimationFrame(() => {
            const startTime = performance.now();
            
            const pageCount = this.renderer.renderPage(this.renderer.currentPage);
            
            const endTime = performance.now();
            console.log(`生成耗时: ${(endTime - startTime).toFixed(2)}ms, 共 ${pageCount} 页`);
            
            this.updatePageInfo();
            this.hideLoading();
        });
    }

    changePage(direction) {
        const pageCount = this.renderer.getPageCount();
        let newPage = this.renderer.currentPage + direction;
        
        if (newPage < 0) newPage = 0;
        if (newPage >= pageCount) newPage = pageCount - 1;
        
        if (newPage !== this.renderer.currentPage) {
            this.renderer.renderPage(newPage);
            this.updatePageInfo();
        }
    }

    updatePageInfo() {
        const current = this.renderer.currentPage + 1;
        const total = this.renderer.getPageCount();
        document.getElementById('pageInfo').textContent = `第 ${current} 页 / 共 ${total} 页`;
        
        document.getElementById('prevPage').disabled = this.renderer.currentPage === 0;
        document.getElementById('nextPage').disabled = this.renderer.currentPage >= total - 1;
    }

    updateAnimationPageInfo() {
        const current = this.strokeAnimation.currentPage + 1;
        const total = this.strokeAnimation.getPageCount();
        document.getElementById('animationPageInfo').textContent = `第 ${current} 页 / 共 ${total} 页`;
        
        document.getElementById('animPrevPage').disabled = this.strokeAnimation.currentPage === 0;
        document.getElementById('animNextPage').disabled = this.strokeAnimation.currentPage >= total - 1;
    }

    async playAnimation() {
        const text = document.getElementById('textInput').value;
        
        const animationOptions = { ...this.renderer.options };
        this.strokeAnimation.setOptions(animationOptions);
        
        this.strokeAnimation.onProgress = (progress) => {
            document.getElementById('animationProgress').value = progress * 100;
            document.getElementById('animationProgressValue').textContent = Math.round(progress * 100) + '%';
        };
        
        this.strokeAnimation.onComplete = () => {
            document.getElementById('playAnimationBtn').style.display = 'block';
            document.getElementById('pauseAnimationBtn').style.display = 'none';
        };
        
        this.isAnimationMode = true;
        this.showLoading();
        
        try {
            await this.strokeAnimation.playPage(this.animationPage);
            this.updateAnimationPageInfo();
            document.getElementById('playAnimationBtn').style.display = 'none';
            document.getElementById('pauseAnimationBtn').style.display = 'block';
        } finally {
            this.hideLoading();
        }
    }

    pauseAnimation() {
        this.strokeAnimation.pause();
        document.getElementById('playAnimationBtn').style.display = 'block';
        document.getElementById('pauseAnimationBtn').style.display = 'none';
    }

    resumeAnimation() {
        this.strokeAnimation.play();
        document.getElementById('playAnimationBtn').style.display = 'none';
        document.getElementById('pauseAnimationBtn').style.display = 'block';
    }

    stopAnimation() {
        this.strokeAnimation.stop();
        this.strokeAnimation.dispose();
        document.getElementById('playAnimationBtn').style.display = 'block';
        document.getElementById('pauseAnimationBtn').style.display = 'none';
        document.getElementById('animationProgress').value = 0;
        document.getElementById('animationProgressValue').textContent = '0%';
    }

    setAnimationSpeed(speed) {
        this.strokeAnimation.setSpeed(speed);
        document.getElementById('animationSpeedValue').textContent = speed.toFixed(1) + 'x';
    }

    setStrokeWidth(width) {
        this.strokeAnimation.setStrokeWidth(width);
        document.getElementById('strokeWidthValue').textContent = width.toFixed(1);
        
        if (this.isAnimationMode) {
            this.strokeAnimation.render();
        }
    }

    setAnimationProgress(progress) {
        if (this.strokeAnimation.pageStrokes.length > 0) {
            this.strokeAnimation.setProgress(progress / 100);
            document.getElementById('animationProgressValue').textContent = Math.round(progress) + '%';
        }
    }

    changeAnimationPage(direction) {
        const pageCount = this.strokeAnimation.getPageCount();
        let newPage = this.animationPage + direction;
        
        if (newPage < 0) newPage = 0;
        if (newPage >= pageCount) newPage = pageCount - 1;
        
        if (newPage !== this.animationPage) {
            this.animationPage = newPage;
            if (this.isAnimationMode) {
                this.stopAnimation();
                this.playAnimation();
            }
            this.updateAnimationPageInfo();
        }
    }

    async exportCurrentPage() {
        await this.exportHandlers.exportCurrentPageDirect();
    }

    async exportAllPages() {
        await this.exportHandlers.exportAllPages();
    }

    async exportLongImage() {
        await this.exportHandlers.exportLongImage();
    }

    showLoading() {
        document.getElementById('loading').style.display = 'block';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const initApp = async () => {
        if (document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready;
            } catch (e) {
                console.warn('字体加载等待超时');
            }
        }
        window.app = new HandwritingApp();
    };
    
    initApp();
});
