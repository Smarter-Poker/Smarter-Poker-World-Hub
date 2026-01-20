// PokerIQ Training Table - POSITIONS LOCKED
document.addEventListener('DOMContentLoaded', () => {
    initCanvasScaling();
});

function initCanvasScaling() {
    const container = document.querySelector('.game-container');
    if (!container) return;
    const CANVAS_WIDTH = 600;
    const CANVAS_HEIGHT = 800;
    function scaleCanvas() {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const scaleX = windowWidth / CANVAS_WIDTH;
        const scaleY = windowHeight / CANVAS_HEIGHT;
        const scale = Math.min(scaleX, scaleY, 1);
        container.style.transform = `scale(${scale})`;
    }
    scaleCanvas();
    window.addEventListener('resize', scaleCanvas);
}
