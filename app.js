document.addEventListener('DOMContentLoaded', () => {
    // --- Series Circuit State ---
    const seriesState = {
        voltage: 15,
        resistors: [10, 5] // Default two resistors in Ohms
    };

    // --- Parallel Circuit State ---
    const parallelState = {
        voltage: 12,
        resistors: [10, 30] // Default two branches
    };

    // --- DOM Elements: Series ---
    const sVoltInput = document.getElementById('series-voltage');
    const sVoltVal = document.getElementById('series-v-val');
    const sBattLabel = document.getElementById('series-batt-label');
    const sAddBtn = document.getElementById('add-series-resistor');
    const sRemBtn = document.getElementById('remove-series-resistor');
    const sElementsContainer = document.getElementById('series-elements-container');
    const sResContainer = document.getElementById('series-resistors-container');
    const sReqDisp = document.getElementById('series-req');
    const sItotDisp = document.getElementById('series-itot');
    const sBreakdown = document.getElementById('series-breakdown');

    // --- DOM Elements: Parallel ---
    const pVoltInput = document.getElementById('parallel-voltage');
    const pVoltVal = document.getElementById('parallel-v-val');
    const pBattLabel = document.getElementById('parallel-batt-label');
    const pAddBtn = document.getElementById('add-parallel-resistor');
    const pRemBtn = document.getElementById('remove-parallel-resistor');
    const pElementsContainer = document.getElementById('parallel-elements-container');
    const pResContainer = document.getElementById('parallel-resistors-container');
    const pReqDisp = document.getElementById('parallel-req');
    const pItotDisp = document.getElementById('parallel-itot');
    const pBreakdown = document.getElementById('parallel-breakdown');

    // --- DOM Elements: Tooltip ---
    const tooltip = document.getElementById('hover-tooltip');
    const ttVolt = document.getElementById('tt-v');
    const ttCurr = document.getElementById('tt-i');

    // ==========================================
    // VISUALIZATION HELPERS
    // ==========================================

    function getVoltageColor(v, maxV) {
        if (maxV === 0) return '#94a3b8'; // default wire color
        if (v < 0.001) return '#3b82f6'; // vivid blue for 0V // using hex for consistent styling
        let ratio = Math.max(0, Math.min(1, v / maxV));
        // hue from 240 (blue) to 0 (red)
        let hue = 240 - (ratio * 240);
        return `hsl(${hue}, 100%, 50%)`;
    }

    function getAnimationSpeed(current) {
        if (current < 0.001) return 'none'; // No current = no flow

        // Typical classroom current range: ~0.3A (high-R) to ~2.4A (low-R)
        const MAX_VISUAL_CURRENT = 2.4;

        // Linear ratio 0→1
        let ratio = Math.max(0.03, Math.min(1, current / MAX_VISUAL_CURRENT));

        // Exponential boost: compress slow currents toward 0, pull fast ones to 1
        // pow < 1 exaggerates differences in the low-current range
        let boosted = Math.pow(ratio, 0.35);

        // Map boosted ratio to duration: 1.0 boosted -> 0.2s (very fast), 0 -> 5.5s (nearly still)
        let duration = 5.5 - (boosted * 5.3);

        return Math.max(0.2, duration) + 's';
    }

    // direction: 'r' | 'l' | 'd' | 'u'
    function createParticles(container, direction, speed, isVertical) {
        if (speed === 'none') return; // zero current = no particles

        // Number of particles scales with speed: faster = more dots visible at once
        const durationSec = parseFloat(speed);
        // Aim for a particle to enter roughly every 300ms
        const count = Math.max(2, Math.round(durationSec / 0.3));

        for (let k = 0; k < count; k++) {
            const dot = document.createElement('span');
            dot.className = 'electron-particle';

            // Position orthogonally centred on the wire
            if (isVertical) {
                dot.style.left = '50%';
                dot.style.top = '0';
            } else {
                dot.style.top = '50%';
                dot.style.left = '0';
            }

            const animName = `particle-flow-${direction}`;
            const delay = -(durationSec * k / count); // negative delay = pre-started
            dot.style.animation = `${animName} ${speed} linear ${delay}s infinite`;
            container.appendChild(dot);
        }
    }

    function createWire(styleObj, color, directionClass, animationName, speed, v, i) {
        const div = document.createElement('div');
        div.className = 'wire';
        div.style.backgroundColor = color;
        for (const [key, value] of Object.entries(styleObj)) {
            div.style[key] = value;
        }

        // Build electron-flow container and spawn particles into it
        const flowContainer = document.createElement('div');
        flowContainer.className = `electron-flow ${directionClass}`;
        const direction = directionClass.replace('flow-', ''); // 'r','l','d','u'
        const isVertical = direction === 'u' || direction === 'd';
        createParticles(flowContainer, direction, speed, isVertical);
        div.appendChild(flowContainer);

        // After layout, measure actual pixel dimensions and set CSS vars on particles
        // so the keyframe calc(var(--w)) / calc(var(--h)) resolves to the right distance
        requestAnimationFrame(() => {
            const w = div.offsetWidth + 'px';
            const h = div.offsetHeight + 'px';
            flowContainer.querySelectorAll('.electron-particle').forEach(p => {
                p.style.setProperty('--w', w);
                p.style.setProperty('--h', h);
            });
        });

        // Tooltip logic
        div.style.pointerEvents = 'auto'; // ensure it can be hovered (container is none)
        div.addEventListener('mouseenter', (e) => {
            ttVolt.innerText = v.toFixed(2);
            ttCurr.innerText = i.toFixed(2);
            tooltip.classList.remove('hidden');
        });
        div.addEventListener('mousemove', (e) => {
            tooltip.style.left = e.clientX + 15 + 'px';
            tooltip.style.top = e.clientY + 15 + 'px';
        });
        div.addEventListener('mouseleave', () => {
            tooltip.classList.add('hidden');
        });

        return div;
    }


    // ==========================================
    // SERIES CIRCUIT LOGIC
    // ==========================================

    function renderSeriesCircuit() {
        sResContainer.innerHTML = '';
        sElementsContainer.innerHTML = ''; // clear wires

        let req = seriesState.resistors.reduce((sum, r) => sum + r, 0);
        let itot = req > 0 ? seriesState.voltage / req : 0;
        let speedStr = getAnimationSpeed(itot);
        let voltage = seriesState.voltage;

        // Update Labels & Math logic displays
        sVoltVal.innerText = voltage;
        sBattLabel.innerText = `${voltage}V`;
        sReqDisp.innerText = req.toFixed(1);
        sItotDisp.innerText = itot.toFixed(2);

        let currentV = voltage;

        // Wire: Battery+ UP to Left-Top
        sElementsContainer.appendChild(createWire(
            { left: '50px', bottom: '50%', height: 'calc(50% - 50px)', width: '4px' },
            getVoltageColor(currentV, voltage), 'flow-u', 'animate-flow-u', speedStr, currentV, itot
        ));

        // Place resistors and horizontal wires evenly. 
        const n = seriesState.resistors.length;
        let positions = [];
        for (let i = 0; i < n; i++) {
            positions.push((i + 1) * (100 / (n + 1)));
        }

        let lPct = 0; // Starts from 0%

        sBreakdown.innerHTML = '';

        seriesState.resistors.forEach((r, index) => {
            let rPct = positions[index];
            let vDrop = itot * r;

            // Draw Top Wire segment from lPct to rPct
            sElementsContainer.appendChild(createWire(
                { left: `calc(50px + (100% - 100px) * ${(lPct) / 100})`, width: `calc((100% - 100px) * ${(rPct - lPct) / 100})`, top: '50px', height: '4px' },
                getVoltageColor(currentV, voltage), 'flow-r', 'animate-flow-r', speedStr, currentV, itot
            ));

            // Create Resistor DOM Element
            const wrapper = document.createElement('div');
            wrapper.className = 'resistor-wrapper';
            wrapper.style.left = `calc(50px + (100% - 100px) * ${(rPct) / 100})`;
            wrapper.style.top = '35px';
            wrapper.style.transform = 'translateX(-50%)'; // center exactly over the position

            wrapper.innerHTML = `
                <div class="resistor"></div>
                <input type="number" class="resistor-input" value="${r}" min="1" max="100" data-index="${index}">
                <span style="font-size: 0.8rem; color: #cbd5e1;">R${index + 1}</span>
            `;
            sResContainer.appendChild(wrapper);

            // Update Breakdown Panel
            const card = document.createElement('div');
            card.className = 'resistor-stat-card';
            card.innerHTML = `
                <h4>R${index + 1} (${r}Ω)</h4>
                <div>V Drop: <span class="highlight-v">${vDrop.toFixed(2)}V</span></div>
                <div>Current: <span class="highlight-i">${itot.toFixed(2)}A</span></div>
            `;
            sBreakdown.appendChild(card);

            currentV -= vDrop; // Voltage splits!
            lPct = rPct;
        });

        // Draw final Top Wire segment from last resistor to right edge (100%)
        sElementsContainer.appendChild(createWire(
            { left: `calc(50px + (100% - 100px) * ${(lPct) / 100})`, right: '50px', top: '50px', height: '4px' },
            getVoltageColor(currentV, voltage), 'flow-r', 'animate-flow-r', speedStr, currentV, itot
        ));

        // Wire: Right edge DOWN
        sElementsContainer.appendChild(createWire(
            { right: '50px', top: '50px', bottom: '50px', width: '4px' },
            getVoltageColor(currentV, voltage), 'flow-d', 'animate-flow-d', speedStr, currentV, itot
        ));

        // Wire: Bottom edge LEFT
        sElementsContainer.appendChild(createWire(
            { left: '50px', right: '50px', bottom: '50px', height: '4px' },
            getVoltageColor(currentV, voltage), 'flow-l', 'animate-flow-l', speedStr, currentV, itot
        ));

        // Wire: Left edge UP back to Battery-
        sElementsContainer.appendChild(createWire(
            { left: '50px', top: '50%', height: 'calc(50% - 50px)', width: '4px' },
            getVoltageColor(currentV, voltage), 'flow-u', 'animate-flow-u', speedStr, currentV, itot
        ));

        // Add Listeners
        const inputs = sResContainer.querySelectorAll('.resistor-input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val <= 0) val = 1;
                seriesState.resistors[parseInt(e.target.dataset.index)] = val;
                renderSeriesCircuit();
            });
        });
    }

    sVoltInput.addEventListener('input', (e) => {
        seriesState.voltage = parseFloat(e.target.value);
        renderSeriesCircuit();
    });

    sAddBtn.addEventListener('click', () => {
        if (seriesState.resistors.length < 5) {
            seriesState.resistors.push(10);
            renderSeriesCircuit();
        } else {
            alert("Maximum 5 resistors for this sim!");
        }
    });

    sRemBtn.addEventListener('click', () => {
        if (seriesState.resistors.length > 1) {
            seriesState.resistors.pop();
            renderSeriesCircuit();
        }
    });

    // ==========================================
    // PARALLEL CIRCUIT LOGIC
    // ==========================================

    function renderParallelCircuit() {
        pResContainer.innerHTML = '';
        pElementsContainer.innerHTML = '';

        // Calculation Math
        let sumInvR = parallelState.resistors.reduce((sum, r) => sum + (1 / r), 0);
        let req = sumInvR > 0 ? 1 / sumInvR : 0;
        let itot = req > 0 ? parallelState.voltage / req : 0;

        let voltage = parallelState.voltage;

        // Labels
        pVoltVal.innerText = voltage;
        pBattLabel.innerText = `${voltage}V`;
        pReqDisp.innerText = req.toFixed(2);
        pItotDisp.innerText = itot.toFixed(2);

        pBreakdown.innerHTML = '';

        let itotSpeedStr = getAnimationSpeed(itot);

        // Main Wires Construction
        const cHighV = getVoltageColor(voltage, voltage); // Source V color
        const cLowV = getVoltageColor(0, voltage); // 0V color

        // Battery UP
        pElementsContainer.appendChild(createWire(
            { left: '50px', bottom: '50%', height: 'calc(50% - 50px)', width: '4px' },
            cHighV, 'flow-u', 'animate-flow-u', itotSpeedStr, voltage, itot
        ));
        // Battery DOWN (Return)
        pElementsContainer.appendChild(createWire(
            { left: '50px', top: '50%', height: 'calc(50% - 50px)', width: '4px' },
            cLowV, 'flow-u', 'animate-flow-u', itotSpeedStr, 0, itot
        ));

        // Place parallel branches evenly across horizontal width
        const n = parallelState.resistors.length;
        let positions = [];
        for (let i = 0; i < n; i++) {
            positions.push(10 + (i + 1) * (80 / (n + 1))); // range from 10% to 90%
        }

        let lPct = 0;
        let currentTop = itot;
        let currentBottom = itot;

        parallelState.resistors.forEach((r, index) => {
            let rPct = positions[index];
            let iBranch = voltage / r; // Current splits! Voltage is constant.
            let branchSpeed = getAnimationSpeed(iBranch);

            // Segment Top Horizontal Wire
            let topSpeed = getAnimationSpeed(currentTop);
            pElementsContainer.appendChild(createWire(
                { left: `calc(50px + (100% - 100px) * ${(lPct) / 100})`, width: `calc((100% - 100px) * ${(rPct - lPct) / 100})`, top: '50px', height: '4px' },
                cHighV, 'flow-r', 'animate-flow-r', topSpeed, voltage, currentTop
            ));

            // Segment Bottom Horizontal Wire
            let btmSpeed = getAnimationSpeed(currentBottom);
            pElementsContainer.appendChild(createWire(
                { left: `calc(50px + (100% - 100px) * ${(lPct) / 100})`, width: `calc((100% - 100px) * ${(rPct - lPct) / 100})`, bottom: '50px', height: '4px' },
                cLowV, 'flow-l', 'animate-flow-l', btmSpeed, 0, currentBottom
            ));

            // Draw Top Half of Branch (High V)
            pElementsContainer.appendChild(createWire(
                { left: `calc(50px + (100% - 100px) * ${(rPct) / 100})`, top: '50px', height: 'calc(50% - 50px)', width: '4px' },
                cHighV, 'flow-d', 'animate-flow-d', branchSpeed, voltage, iBranch
            ));

            // Draw Bottom Half of Branch (Low V)
            pElementsContainer.appendChild(createWire(
                { left: `calc(50px + (100% - 100px) * ${(rPct) / 100})`, bottom: '50px', height: 'calc(50% - 50px)', width: '4px' },
                cLowV, 'flow-d', 'animate-flow-d', branchSpeed, 0, iBranch
            ));

            // Resistor Container
            const wrapper = document.createElement('div');
            wrapper.className = 'resistor-wrapper parallel-branch-resistor';
            wrapper.style.left = `calc(50px + (100% - 100px) * ${(rPct) / 100})`;
            wrapper.style.top = '50%';
            wrapper.style.transform = 'translate(-50%, -50%)';
            wrapper.innerHTML = `
                <div class="resistor"></div>
                <input type="number" class="resistor-input" value="${r}" min="1" max="100" data-index="${index}">
                <span style="position: absolute; left:-25px; bottom: -20px; font-size: 0.8rem; color: #cbd5e1;">R${index + 1}</span>
            `;
            pResContainer.appendChild(wrapper);

            // Update Breakdown Panel
            const card = document.createElement('div');
            card.className = 'resistor-stat-card';
            card.innerHTML = `
                <h4>Branch ${index + 1} (${r}Ω)</h4>
                <div>Voltage: <span class="highlight-v">${voltage}V</span></div>
                <div>Current: <span class="highlight-i">${iBranch.toFixed(2)}A</span></div>
            `;
            pBreakdown.appendChild(card);

            currentTop = Math.max(0, currentTop - iBranch); // Prevent negative due to floating pt
            currentBottom = Math.max(0, currentBottom - iBranch);
            lPct = rPct;
        });

        // Dangling Top Wire past the last branch (0A)
        pElementsContainer.appendChild(createWire(
            { left: `calc(50px + (100% - 100px) * ${(lPct) / 100})`, right: '50px', top: '50px', height: '4px' },
            cHighV, 'flow-r', 'animate-flow-r', getAnimationSpeed(0, 5), voltage, 0
        ));

        // Dangling Bottom Wire past the last branch (0A)
        pElementsContainer.appendChild(createWire(
            { left: `calc(50px + (100% - 100px) * ${(lPct) / 100})`, right: '50px', bottom: '50px', height: '4px' },
            cLowV, 'flow-l', 'animate-flow-l', getAnimationSpeed(0, 5), 0, 0
        ));

        // Add event listeners
        const inputs = pResContainer.querySelectorAll('.resistor-input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val <= 0) val = 1;
                parallelState.resistors[parseInt(e.target.dataset.index)] = val;
                renderParallelCircuit();
            });
        });
    }

    pVoltInput.addEventListener('input', (e) => {
        parallelState.voltage = parseFloat(e.target.value);
        renderParallelCircuit();
    });

    pAddBtn.addEventListener('click', () => {
        if (parallelState.resistors.length < 5) {
            parallelState.resistors.push(10);
            renderParallelCircuit();
        } else {
            alert("Maximum 5 branches for this sim!");
        }
    });

    pRemBtn.addEventListener('click', () => {
        if (parallelState.resistors.length > 1) {
            parallelState.resistors.pop();
            renderParallelCircuit();
        }
    });

    // ==========================================
    // INITIALIZATION
    // ==========================================

    renderSeriesCircuit();
    renderParallelCircuit();

});
