class FireParticleSystem {
    constructor(boardId, containerId) {
        this.board = document.getElementById(boardId);
        this.container = document.getElementById(containerId);
        this.particles = [];
        this.isEmitting = false;
        this.lastTime = performance.now();
        this.animationFrameId = null;

        // Target tracking
        this.targetElement = null;
        this.lastTargetPos = { x: 0, y: 0 };
        this.targetInitialized = false;
    }

    setTarget(element) {
        this.targetElement = element;
        this.targetInitialized = false;
    }

    start() {
        if (!this.animationFrameId) {
            this.lastTime = performance.now();
            this.loop(this.lastTime);
        }
    }

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    loop(currentTime) {
        const dt = (currentTime - this.lastTime) / 1000; // Delta time in seconds
        this.lastTime = currentTime;

        this.update(dt);
        this.animationFrameId = requestAnimationFrame((time) => this.loop(time));
    }

    update(dt) {
        // Track target with smooth interpolation to create continuous trail over discrete steps
        if (this.targetElement && this.container) {
            const targetRect = this.targetElement.getBoundingClientRect();

            // Only update if element is physically mounted and visible
            if (targetRect.width > 0) {
                const containerRect = this.container.getBoundingClientRect();

                // Derive actual scale applied via CSS transforms -> un-scale our coordinates
                const scaleX = containerRect.width / this.container.offsetWidth || 1;
                const scaleY = containerRect.height / this.container.offsetHeight || 1;

                const currentX = (targetRect.left - containerRect.left + (targetRect.width / 2)) / scaleX;
                const currentY = (targetRect.top - containerRect.top + (targetRect.height / 2)) / scaleY;

                if (!this.targetInitialized) {
                    this.lastTargetPos.x = currentX;
                    this.lastTargetPos.y = currentY;
                    this.targetInitialized = true;
                }

                // Snap if teleported across board (e.g. > 300 grid pixels)
                const distance = Math.hypot(currentX - this.lastTargetPos.x, currentY - this.lastTargetPos.y);
                if (distance > 300) {
                    this.lastTargetPos.x = currentX;
                    this.lastTargetPos.y = currentY;
                }

                // Smoothly chase the actual discrete tile position
                this.lastTargetPos.x += (currentX - this.lastTargetPos.x) * 12 * dt;
                this.lastTargetPos.y += (currentY - this.lastTargetPos.y) * 12 * dt;

                if (this.isEmitting) {
                    this.emitParticles(dt, this.lastTargetPos.x, this.lastTargetPos.y);
                }
            }
        }

        // 2. Update existing particles physics & visuals
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];

            // Age
            p.age += dt;
            if (p.age >= p.life) {
                // Remove dead particle
                if (p.element.parentNode) {
                    p.element.parentNode.removeChild(p.element);
                }
                this.particles.splice(i, 1);
                continue;
            }

            // Physics
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Subtle upward drift (heat rises)
            p.vy -= 50 * dt;

            // Visuals
            const progress = p.age / p.life;

            // Scale: shrinking
            const scale = p.startScale * (1 - progress * 0.8);

            // Color: yellow -> orange -> red -> dark/smoke
            // Simplified: interpolate basic colors or just use multiple drop shadows
            let currentHex = this.interpolateColor(p.colorStart, p.colorEnd, progress);

            // Opacity: fade out
            const alpha = 1 - Math.pow(progress, 2);

            p.element.style.transform = `translate(${p.x}px, ${p.y}px) scale(${scale})`;
            p.element.style.backgroundColor = currentHex;
            p.element.style.opacity = alpha;
        }
    }

    emitParticles(dt, targetX, targetY) {
        // Calculate emission rate (e.g., 60 particles per second)
        const emitRate = 80; // slightly higher density for continuous trail
        const numToEmit = Math.floor(emitRate * dt) + (Math.random() < (emitRate * dt) % 1 ? 1 : 0);

        if (numToEmit <= 0) return;

        for (let i = 0; i < numToEmit; i++) {
            this.spawnParticle(targetX, targetY);
        }
    }

    spawnParticle(x, y) {
        // Randomize initial parameters
        const life = 0.5 + Math.random() * 0.5; // 0.5 to 1.0 seconds
        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 30;

        // Spread spawn point slightly
        const spawnX = x + (Math.random() - 0.5) * 15;
        const spawnY = y + (Math.random() - 0.5) * 15 + 10; // slightly lower (base of target)

        const p = {
            x: spawnX,
            y: spawnY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 60, // Stronger initial upward velocity for fire
            life: life,
            age: 0,
            startScale: 1.0 + Math.random() * 0.8,
            // Fire gradient colors
            colorStart: [255, 220, 50], // Bright Yellow/White inner flame
            colorEnd: [255, 30, 0],   // Deep Red outer flame
            element: document.createElement('div')
        };

        // DOM styling - removed mix-blend-screen for solid robust visibility, replaced with severe drop shadow brightness
        p.element.className = 'absolute top-0 left-0 w-3 h-3 rounded-full pointer-events-none shadow-[0_0_15px_rgba(255,80,0,1)] z-40';
        p.element.style.backgroundColor = 'rgb(255,220,50)';
        p.element.style.transformOrigin = 'center center';
        p.element.style.willChange = 'transform, opacity, backgroundColor';

        this.container.appendChild(p.element);
        this.particles.push(p);
    }

    // Helper for color interpolation
    interpolateColor(c1, c2, factor) {
        // Fast power factor for fire look
        let f = Math.pow(factor, 1.5);
        let r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
        let g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
        let b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
        return `rgb(${r},${g},${b})`;
    }
}
