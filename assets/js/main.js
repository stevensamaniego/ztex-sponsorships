/* ==========================================================================
   ZTEX Construction — Sponsorship Portal JS
   ========================================================================== */

// --- Preloader ---
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('preloader').classList.add('hidden');
    }, 1800);
});

// --- Particles Background ---
(function initParticles() {
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouse = { x: null, y: null };
    let animFrame;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.4;
            this.speedY = (Math.random() - 0.5) * 0.4;
            this.opacity = Math.random() * 0.5 + 0.1;
            this.color = Math.random() > 0.85 ? '#c10e20' : '#555555';
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            // Mouse interaction
            if (mouse.x !== null) {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    const force = (120 - dist) / 120;
                    this.x += (dx / dist) * force * 1.5;
                    this.y += (dy / dist) * force * 1.5;
                }
            }

            if (this.x < 0 || this.x > canvas.width ||
                this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // Adaptive particle count
    const count = Math.min(80, Math.floor(window.innerWidth * 0.05));
    for (let i = 0; i < count; i++) {
        particles.push(new Particle());
    }

    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    const opacity = (1 - dist / 150) * 0.15;
                    ctx.strokeStyle = `rgba(193, 14, 32, ${opacity})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        drawConnections();
        animFrame = requestAnimationFrame(animate);
    }
    animate();
})();

// --- Sticky Nav ---
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 80);
});

// --- Smooth Scroll for Anchor Links ---
document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            const offset = 80;
            const y = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    });
});

// --- Reveal on Scroll ---
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });
revealElements.forEach(el => revealObserver.observe(el));

// --- Counter Animation ---
const statNumbers = document.querySelectorAll('.stat-number');
const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseInt(el.getAttribute('data-count'));
            animateCounter(el, target);
            counterObserver.unobserve(el);
        }
    });
}, { threshold: 0.5 });
statNumbers.forEach(el => counterObserver.observe(el));

function animateCounter(el, target) {
    const duration = 1500;
    const start = performance.now();
    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4); // ease-out quart
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// --- Multi-Step Form ---
const form = document.getElementById('sponsorshipForm');
const steps = document.querySelectorAll('.form-step');
const progressSteps = document.querySelectorAll('.progress-step');
const progressConnectors = document.querySelectorAll('.progress-connector');
let currentStep = 1;

// Navigation buttons
document.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', () => {
        const nextStep = parseInt(btn.getAttribute('data-next'));
        if (validateStep(currentStep)) {
            goToStep(nextStep);
        }
    });
});

document.querySelectorAll('.btn-prev').forEach(btn => {
    btn.addEventListener('click', () => {
        const prevStep = parseInt(btn.getAttribute('data-prev'));
        goToStep(prevStep);
    });
});

function goToStep(step) {
    steps.forEach(s => s.classList.remove('active'));
    document.getElementById(`step${step}`).classList.add('active');

    progressSteps.forEach((ps, i) => {
        const stepNum = i + 1;
        ps.classList.remove('active', 'completed');
        if (stepNum === step) ps.classList.add('active');
        else if (stepNum < step) ps.classList.add('completed');
    });

    progressConnectors.forEach((pc, i) => {
        pc.classList.toggle('active', i < step - 1);
    });

    currentStep = step;

    // Scroll form into view
    document.getElementById('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(step) {
    const stepEl = document.getElementById(`step${step}`);
    const requiredFields = stepEl.querySelectorAll('[required]');
    let valid = true;

    requiredFields.forEach(field => {
        field.classList.remove('error');
        if (!field.value.trim()) {
            field.classList.add('error');
            valid = false;
        }
        // Email validation
        if (field.type === 'email' && field.value.trim()) {
            const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRe.test(field.value.trim())) {
                field.classList.add('error');
                valid = false;
            }
        }
    });

    if (!valid) {
        // Shake the first error field
        const firstError = stepEl.querySelector('.form-input.error');
        if (firstError) {
            firstError.style.animation = 'none';
            firstError.offsetHeight; // trigger reflow
            firstError.style.animation = 'shake 0.4s ease';
            firstError.focus();
        }
    }

    return valid;
}

// Clear error on input
document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => {
        input.classList.remove('error');
    });
});

// Shake animation (injected)
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-6px); }
        40% { transform: translateX(6px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
    }
`;
document.head.appendChild(shakeStyle);

// --- File Upload ---
const fileZone = document.getElementById('fileUploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
let uploadedFiles = [];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

fileZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileZone.classList.add('dragover');
});

fileZone.addEventListener('dragleave', () => {
    fileZone.classList.remove('dragover');
});

fileZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = ''; // Reset so same file can be re-added
});

function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (uploadedFiles.length >= MAX_FILES) {
            showToast(`Maximum ${MAX_FILES} files allowed`);
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            showToast(`"${file.name}" exceeds 10MB limit`);
            return;
        }
        // Check for duplicates
        if (uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
            showToast(`"${file.name}" already added`);
            return;
        }
        uploadedFiles.push(file);
    });
    renderFileList();
}

function renderFileList() {
    fileList.innerHTML = '';
    uploadedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <svg class="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="file-name">${file.name}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
            <button type="button" class="file-remove" data-index="${index}" title="Remove file">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;
        fileList.appendChild(item);
    });

    // Bind remove buttons
    document.querySelectorAll('.file-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-index'));
            uploadedFiles.splice(idx, 1);
            renderFileList();
        });
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// --- Toast Notifications ---
function showToast(message) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;bottom:2rem;right:2rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = `
        padding: 0.75rem 1.25rem;
        background: #2a2a2a;
        border: 1px solid #3a3a3a;
        border-left: 3px solid #c10e20;
        border-radius: 6px;
        color: #e8e8e8;
        font-size: 0.85rem;
        font-family: var(--font-body);
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Phone Formatting ---
document.getElementById('phone').addEventListener('input', function(e) {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 0) {
        if (val.length <= 3) {
            val = `(${val}`;
        } else if (val.length <= 6) {
            val = `(${val.slice(0,3)}) ${val.slice(3)}`;
        } else {
            val = `(${val.slice(0,3)}) ${val.slice(3,6)}-${val.slice(6,10)}`;
        }
    }
    e.target.value = val;
});

// --- Currency Formatting ---
document.getElementById('sponsorshipAmount').addEventListener('blur', function(e) {
    let val = e.target.value.replace(/[^0-9.]/g, '');
    if (val) {
        const num = parseFloat(val);
        if (!isNaN(num)) {
            e.target.value = '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    }
});
document.getElementById('sponsorshipAmount').addEventListener('focus', function(e) {
    let val = e.target.value.replace(/[^0-9.]/g, '');
    e.target.value = val;
});

// --- Form Submission ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateStep(3)) return;

    const submitBtn = form.querySelector('.btn-submit');
    submitBtn.classList.add('loading');

    // Build FormData
    const formData = new FormData();
    formData.append('orgName', document.getElementById('orgName').value.trim());
    formData.append('contactName', document.getElementById('contactName').value.trim());
    formData.append('email', document.getElementById('email').value.trim());
    formData.append('phone', document.getElementById('phone').value.trim());
    formData.append('eventName', document.getElementById('eventName').value.trim());
    formData.append('eventDate', document.getElementById('eventDate').value);
    formData.append('sponsorshipAmount', document.getElementById('sponsorshipAmount').value.trim());
    formData.append('sponsorshipTier', document.getElementById('sponsorshipTier').value);
    formData.append('description', document.getElementById('description').value.trim());
    formData.append('additionalNotes', document.getElementById('additionalNotes').value.trim());

    uploadedFiles.forEach(file => {
        formData.append('files', file);
    });

    try {
        // POST to Formspree (handles email delivery + file attachments)
        const response = await fetch('https://formspree.io/f/mojoepqv', {
            method: 'POST',
            body: formData,
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error('Submission failed');

        // Show success
        form.style.display = 'none';
        document.getElementById('formSuccess').classList.add('active');
    } catch (err) {
        console.error('Submission error:', err);
        showToast('Something went wrong. Please try again or call (915) 591-6900.');
        submitBtn.classList.remove('loading');
    }
});

// --- Reset Form ---
window.resetForm = function() {
    form.reset();
    uploadedFiles = [];
    renderFileList();
    form.style.display = '';
    document.getElementById('formSuccess').classList.remove('active');
    goToStep(1);
    document.getElementById('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
