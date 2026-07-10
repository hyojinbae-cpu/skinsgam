'use strict';
// ============================================================
//  MASK PACK CHALLENGE – script.js
// ============================================================

// ─── Canvas & context ────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
let W, H, cx, cy;

function resize() {
  const wrap = document.getElementById('gameWrap');
  const hud  = document.querySelector('.hud');
  const instr = document.querySelector('.instruction-bar');
  const reserved = (hud ? hud.offsetHeight : 56) + (instr ? instr.offsetHeight : 48);
  W = canvas.width  = wrap.clientWidth;
  H = canvas.height = Math.max(300, wrap.clientHeight - reserved);
  cx = W / 2;  cy = H / 2;
}

// ─── Game state ───────────────────────────────────────────────
const ST = { START:0, TEAR:1, PICK:2, APPLY:3, DONE:4 };
let state = ST.START;
let startTime, elapsedSec = 0;
let score = 0;
let musicOn = false;
let rafId   = null;

// ─── Package ─────────────────────────────────────────────────
const PKG = { w:160, h:220 };   // dimensions
let pkg = {
  x:0, y:0,            // top-left of package
  tearProg: 0,         // 0→1
  isOpen: false,
  openAnim: 0,         // 0→1 open animation
};

// Tear drag state
let tearDrag = { active:false, startY:0, currY:0 };

// ─── Mask (cloth physics) ─────────────────────────────────────
let mask = {
  x:0, y:0,            // centre
  vx:0, vy:0,          // velocity
  rot:0,               // rotation radians
  targetX:0, targetY:0,
  held:false,
  inPackage:true,      // still inside package
  placed:false,
  w:82, h:115,
  alpha:1, scale:1,
};
let prevMouseX = 0, prevMouseY = 0;

// ─── Face ────────────────────────────────────────────────────
let face = { x:0, y:0, w:180, h:230 };  // centre

// Snap & glow
let snapAnim    = 0;   // 0→1 when snapping
let glowAnim    = 0;
let glowOn      = false;

// ─── Particles ───────────────────────────────────────────────
let particles   = [];

// ─── Confetti (complete screen) ──────────────────────────────
const confCvs   = document.getElementById('confettiCanvas');
const confCtx   = confCvs.getContext('2d');
let confetti    = [];
let confRunning = false;

// ─── Input ───────────────────────────────────────────────────
let mouse = { x:0, y:0, down:false };

function getPos(e) {
  const r   = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - r.left) * (W / r.width),
    y: (src.clientY - r.top)  * (H / r.height),
  };
}

// ─── Helpers ─────────────────────────────────────────────────
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x+w, y+h-r);
  ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h);
  ctx.arcTo(x, y+h,   x, y+h-r,   r);
  ctx.lineTo(x, y+r);
  ctx.arcTo(x, y,     x+r, y,     r);
  ctx.closePath();
}

function lerp(a, b, t) { return a + (b - a) * t; }

function dist(ax, ay, bx, by) { return Math.hypot(ax-bx, ay-by); }

// ─── Draw: Package closed ─────────────────────────────────────
function drawPackageClosed(px, py, tearProg) {
  const { w, h } = PKG;
  ctx.save();

  // Body gradient
  const g = ctx.createLinearGradient(px, py, px+w, py+h);
  g.addColorStop(0,   '#F9C8DA'); g.addColorStop(0.25, '#F5B4CE');
  g.addColorStop(0.6, '#E8A0C0'); g.addColorStop(1,   '#F0B0CC');
  rrect(px, py, w, h, 18); ctx.fillStyle = g; ctx.fill();

  // Foil shimmer
  const shine = ctx.createLinearGradient(px, py, px+w*0.6, py+h*0.55);
  shine.addColorStop(0, 'rgba(255,255,255,0.42)');
  shine.addColorStop(0.45, 'rgba(255,255,255,0.08)');
  shine.addColorStop(1,   'rgba(255,255,255,0)');
  rrect(px, py, w, h, 18); ctx.fillStyle = shine; ctx.fill();

  // Side seals
  ctx.save(); ctx.strokeStyle = 'rgba(210,130,165,0.55)'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px+7, py+24); ctx.lineTo(px+7, py+h-24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px+w-7, py+24); ctx.lineTo(px+w-7, py+h-24); ctx.stroke();
  ctx.restore();

  // Border
  rrect(px, py, w, h, 18);
  ctx.strokeStyle = 'rgba(210,130,165,0.7)'; ctx.lineWidth = 2; ctx.stroke();

  // Product window
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(px+w/2, py+h*0.40, w*0.37, h*0.25, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.fill();
  // Mini mask icon inside window
  drawMiniMask(px+w/2, py+h*0.40, w*0.34, h*0.22);
  ctx.restore();

  // Brand text
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(180,80,130,0.9)';
  ctx.font = `bold ${w*0.11}px Arial`;
  ctx.fillText('OLIVEYOUNG', px+w/2, py+h*0.73);
  ctx.font = `${w*0.09}px Arial`;
  ctx.fillStyle = 'rgba(150,60,110,0.8)';
  ctx.fillText('Sheet Mask', px+w/2, py+h*0.81);
  ctx.font = `${w*0.078}px Arial`;
  ctx.fillText('진정 · 보습 케어', px+w/2, py+h*0.88);

  // Notch cut indicator (top-right)
  ctx.fillStyle = 'rgba(200,50,100,0.9)';
  ctx.beginPath();
  ctx.moveTo(px+w-24, py+2); ctx.lineTo(px+w, py+2); ctx.lineTo(px+w, py+30);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'white'; ctx.font = `bold 9px Arial`;
  ctx.fillText('✂', px+w-9, py+20);

  // Tear progress bar
  const barX = px+w/2-55, barY = py+h+14;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  rrect(barX, barY, 110, 8, 4); ctx.fill();
  if (tearProg > 0) {
    const g2 = ctx.createLinearGradient(barX, 0, barX+110, 0);
    g2.addColorStop(0,'#F06090'); g2.addColorStop(1,'#C020A0');
    ctx.fillStyle = g2; rrect(barX, barY, 110*tearProg, 8, 4); ctx.fill();
  }
  ctx.fillStyle = '#B080A0'; ctx.font = '11px Arial';
  ctx.fillText('Drag corner to tear ✂', px+w/2, barY+22);

  ctx.restore();
}

function drawMiniMask(cx, cy, w, h) {
  // Quick off-screen render for mask icon inside package window
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy, w/2, h/2, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(238,245,255,0.95)'; ctx.fill();
  ctx.strokeStyle = 'rgba(180,200,240,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  // Eye holes visual (just circles, no clipping for mini)
  ctx.fillStyle = 'rgba(200,215,240,0.6)';
  ctx.beginPath(); ctx.ellipse(cx-w*0.22, cy-h*0.06, w*0.13, h*0.14, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+w*0.22, cy-h*0.06, w*0.13, h*0.14, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

// ─── Draw: Package open ───────────────────────────────────────
function drawPackageOpen(px, py, openAnim) {
  const { w, h } = PKG;
  const tearY = py + h*0.22 * (1 - openAnim*0.3);
  ctx.save();

  // Bottom part
  const g = ctx.createLinearGradient(px, py, px+w, py+h);
  g.addColorStop(0, '#F9C8DA'); g.addColorStop(1, '#E8A0C0');

  ctx.beginPath();
  ctx.moveTo(px, tearY+10);
  // Jagged tear edge
  for (let i = 0; i <= 8; i++) {
    const tx = px + (w/8)*i;
    const ty = tearY + (i%2===0 ? -7 : 9);
    ctx.lineTo(tx, ty);
  }
  ctx.lineTo(px+w, tearY+10);
  ctx.lineTo(px+w, py+h-18); ctx.arcTo(px+w, py+h, px+w-18, py+h, 18);
  ctx.lineTo(px+18, py+h);   ctx.arcTo(px, py+h,   px, py+h-18, 18);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();

  // Side seals
  ctx.save(); ctx.strokeStyle = 'rgba(210,130,165,0.5)'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px+7, tearY+18); ctx.lineTo(px+7, py+h-24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px+w-7, tearY+18); ctx.lineTo(px+w-7, py+h-24); ctx.stroke();
  ctx.restore();

  // Shine
  const shine = ctx.createLinearGradient(px, tearY, px+w*0.5, py+h);
  shine.addColorStop(0, 'rgba(255,255,255,0.3)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath(); ctx.ellipse(px+w*0.35, py+h*0.6, w*0.22, h*0.22, 0, 0, Math.PI*2);
  ctx.fill();

  // Inside gradient (dark)
  ctx.beginPath();
  ctx.rect(px+10, tearY+8, w-20, 30);
  const inG = ctx.createLinearGradient(0, tearY+8, 0, tearY+38);
  inG.addColorStop(0, 'rgba(60,20,40,0.5)'); inG.addColorStop(1, 'rgba(60,20,40,0)');
  ctx.fillStyle = inG; ctx.fill();

  ctx.restore();
}

// ─── Draw: Sheet mask ─────────────────────────────────────────
// Uses an offscreen canvas to handle eye-hole clipping
const maskOC = document.createElement('canvas');
const maskOCCtx = maskOC.getContext('2d');

function buildMaskOffscreen(w, h) {
  maskOC.width = w*2; maskOC.height = h*2;  // retina-like
  const mc = maskOCCtx;
  const bw = w*2, bh = h*2, br = 16;
  mc.clearRect(0, 0, bw, bh);

  // Body
  mc.beginPath();
  mc.ellipse(bw/2, bh/2, bw/2-4, bh/2-4, 0, 0, Math.PI*2);
  const mg = mc.createRadialGradient(bw*0.35, bh*0.3, 0, bw/2, bh/2, bw*0.55);
  mg.addColorStop(0, '#FAFCFF'); mg.addColorStop(0.6, '#F0F5FF'); mg.addColorStop(1, '#E4EEFF');
  mc.fillStyle = mg; mc.fill();
  mc.strokeStyle = 'rgba(170,195,240,0.55)'; mc.lineWidth = 3; mc.stroke();

  // Texture fold lines (horizontal)
  mc.strokeStyle = 'rgba(195,215,248,0.3)'; mc.lineWidth = 1.5;
  [0.3, 0.7].forEach(t => {
    mc.beginPath(); mc.moveTo(bw*0.12, bh*t); mc.lineTo(bw*0.88, bh*t); mc.stroke();
  });

  // Cut eye holes
  mc.globalCompositeOperation = 'destination-out';
  const ew = bw*0.15, eh = bh*0.075, ey = bh*0.44, exOff = bw*0.214;
  mc.beginPath(); mc.ellipse(bw/2 - exOff, ey, ew, eh, 0, 0, Math.PI*2); mc.fill();
  mc.beginPath(); mc.ellipse(bw/2 + exOff, ey, ew, eh, 0, 0, Math.PI*2); mc.fill();
  // Nose gap
  mc.beginPath(); mc.ellipse(bw/2, bh*0.57, bw*0.08, bh*0.07, 0, 0, Math.PI*2); mc.fill();
  mc.globalCompositeOperation = 'source-over';
}

function drawMask(mx, my, w, h, rot, alpha, scale) {
  buildMaskOffscreen(w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(mx, my);
  ctx.rotate(rot);
  ctx.scale(scale, scale);

  // Drop shadow
  ctx.shadowColor = 'rgba(140,160,210,0.35)';
  ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.drawImage(maskOC, -w, -h, w*2, h*2);
  ctx.shadowColor = 'transparent';

  ctx.restore();
}

// ─── Draw: Woman's face ───────────────────────────────────────
function drawFace(fx, fy, fw, fh) {
  ctx.save();

  // Shoulder hint
  ctx.fillStyle = '#F0C8A0';
  ctx.beginPath(); ctx.ellipse(fx, fy + fh*0.65, fw*0.7, fh*0.18, 0, 0, Math.PI*2); ctx.fill();

  // Neck
  ctx.fillStyle = '#FFD5B0';
  ctx.beginPath(); ctx.ellipse(fx, fy + fh*0.47, fw*0.17, fh*0.1, 0, 0, Math.PI*2); ctx.fill();

  // Hair back
  ctx.fillStyle = '#261418';
  ctx.beginPath(); ctx.ellipse(fx, fy - fh*0.12, fw*0.48, fh*0.36, 0, 0, Math.PI*2); ctx.fill();

  // Face skin
  const sk = ctx.createRadialGradient(fx-fw*0.1, fy-fh*0.12, 0, fx, fy, fw*0.55);
  sk.addColorStop(0,'#FFE8CC'); sk.addColorStop(0.55,'#FFD4A8'); sk.addColorStop(1,'#F5C094');
  ctx.beginPath(); ctx.ellipse(fx, fy, fw*0.44, fh*0.49, 0, 0, Math.PI*2);
  ctx.fillStyle = sk; ctx.fill();

  // Ear
  ctx.fillStyle = '#F5C094';
  ctx.beginPath(); ctx.ellipse(fx-fw*0.43, fy+fh*0.02, fw*0.07, fh*0.1, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(fx+fw*0.43, fy+fh*0.02, fw*0.07, fh*0.1, 0, 0, Math.PI*2); ctx.fill();

  // Hair front
  ctx.fillStyle = '#261418';
  ctx.beginPath(); ctx.ellipse(fx, fy-fh*0.33, fw*0.44, fh*0.2, 0, Math.PI, Math.PI*2); ctx.fill();
  // Side swoop bangs
  ctx.beginPath(); ctx.ellipse(fx-fw*0.37, fy-fh*0.18, fw*0.15, fh*0.19, 0.35, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(fx+fw*0.37, fy-fh*0.18, fw*0.15, fh*0.19, -0.35, 0, Math.PI*2); ctx.fill();

  // Closed eyes (spa / relaxed)
  ctx.strokeStyle = '#4A2828'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
  [-1, 1].forEach(side => {
    const ex = fx + side * fw * 0.195;
    const ey = fy - fh * 0.06;
    ctx.beginPath(); ctx.arc(ex, ey, fw*0.095, Math.PI*0.08, Math.PI*0.92); ctx.stroke();
    // Lashes
    ctx.lineWidth = 1.8;
    [-0.06, 0, 0.06].forEach(d => {
      const lx = ex + d * fw;
      const ly = ey - fw*0.095;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + d*fw*0.25, ly - 7); ctx.stroke();
    });
    ctx.lineWidth = 2.8;
  });

  // Eyebrows
  ctx.strokeStyle = '#3A2020'; ctx.lineWidth = 2.2;
  [-1, 1].forEach(side => {
    const ex = fx + side * fw * 0.195;
    const ey = fy - fh * 0.175;
    ctx.beginPath(); ctx.arc(ex, ey, fw*0.085, Math.PI*0.12, Math.PI*0.88); ctx.stroke();
  });

  // Nose (minimal)
  ctx.strokeStyle = 'rgba(175,100,75,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(fx, fy + fh*0.07, fw*0.065, Math.PI*0.15, Math.PI*0.85); ctx.stroke();

  // Blush
  [-1, 1].forEach(side => {
    const bx = fx + side * fw * 0.29;
    const by = fy + fh * 0.06;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, fw*0.18);
    bg.addColorStop(0, 'rgba(255,155,155,0.38)'); bg.addColorStop(1, 'transparent');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(bx, by, fw*0.18, fh*0.1, 0, 0, Math.PI*2); ctx.fill();
  });

  // Mouth
  ctx.strokeStyle = 'rgba(190,85,85,0.75)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(fx, fy + fh*0.25, fw*0.12, Math.PI*0.12, Math.PI*0.88); ctx.stroke();

  // Face highlight
  const hl = ctx.createRadialGradient(fx-fw*0.14, fy-fh*0.2, 0, fx-fw*0.08, fy-fh*0.1, fw*0.22);
  hl.addColorStop(0, 'rgba(255,255,255,0.52)'); hl.addColorStop(1, 'transparent');
  ctx.fillStyle = hl;
  ctx.beginPath(); ctx.ellipse(fx-fw*0.14, fy-fh*0.2, fw*0.16, fh*0.1, -0.4, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

// ─── Draw: Snap zone indicator ────────────────────────────────
function drawSnapZone(fx, fy, fw, fh) {
  if (mask.placed) return;
  const pulse = 0.4 + 0.25 * Math.sin(Date.now() * 0.004);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(fx, fy, fw*0.44+8, fh*0.49+8, 0, 0, Math.PI*2);
  ctx.strokeStyle = `rgba(200,100,180,${pulse})`;
  ctx.lineWidth = 2; ctx.setLineDash([8,6]); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Draw: Glow ring ─────────────────────────────────────────
function drawGlow(fx, fy, fw, fh, t) {
  const rad = fw * 0.55 + t * 30;
  const alpha = Math.max(0, 0.7 * (1 - t));
  const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, rad);
  g.addColorStop(0,   `rgba(255,200,240,0)`);
  g.addColorStop(0.6, `rgba(255,180,230,${alpha * 0.4})`);
  g.addColorStop(1,   `rgba(255,140,210,0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(fx, fy, rad, 0, Math.PI*2); ctx.fill();
}

// ─── Draw: Sparkle particles ──────────────────────────────────
function spawnParticles(x, y, count) {
  const colors = ['#FFD700','#FF80B0','#80D0FF','#C880FF','#90FF90','#FF9060'];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI*2/count)*i + Math.random()*0.5;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      r: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random()*colors.length)],
      life: 1, decay: 0.018 + Math.random()*0.015,
      type: Math.random() > 0.5 ? 'star' : 'circle',
    });
  }
}

function drawStar(x, y, r, color, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a1 = (Math.PI*2/5)*i - Math.PI/2;
    const a2 = a1 + Math.PI/5;
    i === 0 ? ctx.moveTo(Math.cos(a1)*r, Math.sin(a1)*r) : ctx.lineTo(Math.cos(a1)*r, Math.sin(a1)*r);
    ctx.lineTo(Math.cos(a2)*r*0.4, Math.sin(a2)*r*0.4);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function updateDrawParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12; // gravity
    p.vx *= 0.97;
    p.life -= p.decay;
    const a = Math.max(0, p.life);
    if (p.type === 'star') {
      drawStar(p.x, p.y, p.r, p.color, a);
    } else {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  });
}

// ─── Cloth physics update ─────────────────────────────────────
const SPRING_K   = 0.14;
const DAMPING    = 0.72;
const MAX_ROT    = 0.28;

function updateMaskPhysics() {
  if (!mask.held || mask.placed) return;
  const dx   = mask.targetX - mask.x;
  const dy   = mask.targetY - mask.y;
  mask.vx   += dx * SPRING_K;
  mask.vy   += dy * SPRING_K;
  mask.vx   *= DAMPING;
  mask.vy   *= DAMPING;
  mask.x    += mask.vx;
  mask.y    += mask.vy;
  mask.rot   = Math.max(-MAX_ROT, Math.min(MAX_ROT, mask.vx * 0.06));
}

// ─── Confetti ────────────────────────────────────────────────
function startConfetti() {
  confCvs.width  = window.innerWidth;
  confCvs.height = window.innerHeight;
  confetti = [];
  const colors = ['#FF80B0','#FFD700','#80B0FF','#A0FF80','#FF9060','#C080FF'];
  for (let i = 0; i < 120; i++) {
    confetti.push({
      x: Math.random() * confCvs.width,
      y: -10 - Math.random() * 200,
      vx: (Math.random()-0.5) * 3,
      vy: 2 + Math.random() * 4,
      w: 6 + Math.random() * 10,
      h: 8 + Math.random() * 6,
      angle: Math.random()*Math.PI*2,
      spin: (Math.random()-0.5) * 0.15,
      color: colors[Math.floor(Math.random()*colors.length)],
      life: 1,
    });
  }
  confRunning = true;
  animConfetti();
}

function animConfetti() {
  if (!confRunning) return;
  confCtx.clearRect(0,0,confCvs.width,confCvs.height);
  let alive = 0;
  confetti.forEach(c => {
    c.x += c.vx; c.y += c.vy; c.angle += c.spin; c.vy += 0.05;
    if (c.y < confCvs.height) alive++;
    confCtx.save();
    confCtx.translate(c.x, c.y); confCtx.rotate(c.angle);
    confCtx.fillStyle = c.color; confCtx.globalAlpha = Math.min(1, (confCvs.height-c.y)/100);
    confCtx.fillRect(-c.w/2, -c.h/2, c.w, c.h);
    confCtx.restore();
  });
  if (alive > 0) requestAnimationFrame(animConfetti);
  else { confRunning = false; confCtx.clearRect(0,0,confCvs.width,confCvs.height); }
}

// ─── Timer & Score HUD ───────────────────────────────────────
function updateHUD() {
  const s = Math.floor(elapsedSec);
  document.getElementById('timerDisplay').textContent =
    `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  document.getElementById('scoreDisplay').textContent = score;
}

function setStep(n, label) {
  [1,2,3].forEach(i => {
    const d = document.getElementById('sd'+i);
    d.className = 'sdot' + (i<n?' done':i===n?' active':'');
  });
  document.getElementById('stepLabel').textContent = label;
}

function setInstr(txt) {
  document.getElementById('instrText').textContent = txt;
}

// ─── Layout helpers ──────────────────────────────────────────
function layoutPositions() {
  pkg.x = cx - PKG.w/2;
  pkg.y = cy - PKG.h/2 - 20;
  face.x = cx;
  face.y = cy - 10;
  mask.x = cx;
  mask.y = cy + 60;
}

// ─── Placement check ─────────────────────────────────────────
const SNAP_RADIUS = 60;
function checkSnap() {
  if (mask.placed || !mask.held) return;
  const d = dist(mask.x, mask.y, face.x, face.y);
  if (d < SNAP_RADIUS) {
    mask.held    = false;
    mask.placed  = true;
    mask.targetX = face.x;
    mask.targetY = face.y;
    // Animate snap
    snapAnim = 0;
    glowOn   = true;
    glowAnim = 0;
    spawnParticles(face.x, face.y, 32);
    score += Math.max(0, 300 - Math.floor(elapsedSec) * 3);
    score += Math.round((1 - d/SNAP_RADIUS) * 200); // accuracy bonus
    score = Math.max(0, score);
    setTimeout(() => showComplete(), 1200);
    playSound('place');
  }
}

// Animate mask to snap target
function animateSnap() {
  if (!mask.placed) return;
  mask.x = lerp(mask.x, face.x, 0.18);
  mask.y = lerp(mask.y, face.y, 0.18);
  mask.rot = lerp(mask.rot, 0, 0.2);
  mask.scale = lerp(mask.scale, 1.0, 0.15);
  snapAnim = Math.min(1, snapAnim + 0.04);
  if (glowOn) { glowAnim = Math.min(1, glowAnim + 0.025); if (glowAnim >= 1) glowOn = false; }
}

// ─── Complete screen ─────────────────────────────────────────
function showComplete() {
  state = ST.DONE;

  const best = parseInt(localStorage.getItem('maskBest') || '0');
  const isNew = score > best;
  if (isNew) localStorage.setItem('maskBest', score);

  const stars = score >= 800 ? 3 : score >= 500 ? 2 : 1;
  const msgs  = { 3:'Perfect! ✨', 2:'Great Job! 🌟', 1:'Nice Try! 💪' };

  document.getElementById('completeTitle').textContent = msgs[stars];
  document.getElementById('completeFace').textContent  = stars===3?'🤩':stars===2?'😊':'😄';
  document.getElementById('starsRow').innerHTML        = '⭐'.repeat(stars) + '☆'.repeat(3-stars);

  document.getElementById('finalScore').textContent = score;
  document.getElementById('newBestRow').style.display = isNew ? 'flex' : 'none';

  const s = Math.floor(elapsedSec);
  document.getElementById('scoreDetails').innerHTML =
    `⏱ Time: ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}<br>` +
    `🎯 Placement bonus: +${Math.round((1 - Math.min(1, dist(mask.x,mask.y,face.x,face.y)/SNAP_RADIUS))*200)}`;

  document.getElementById('completeScreen').classList.add('active');
  startConfetti();
}

// ─── Sound (placeholder hooks) ───────────────────────────────
function playSound(type) {
  if (!musicOn) return;
  // Web Audio API tones as placeholders
  try {
    const ac  = new AudioContext();
    const osc = ac.createOscillator();
    const g   = ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    const map = { tear:[280,0.08], pick:[440,0.06], place:[660,0.1], done:[880,0.12] };
    const [freq, vol] = map[type] || [440, 0.08];
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq*1.4, ac.currentTime+0.15);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.3);
    osc.start(); osc.stop(ac.currentTime+0.3);
  } catch(e) {}
}

// ─── Main render loop ────────────────────────────────────────
function render(ts) {
  rafId = requestAnimationFrame(render);

  if (state === ST.START || state === ST.DONE) return;

  // Timer
  if (state !== ST.START && state !== ST.DONE) {
    elapsedSec = (Date.now() - startTime) / 1000;
    updateHUD();
  }

  ctx.clearRect(0,0,W,H);

  // Background
  const bg = ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#FDE8F0'); bg.addColorStop(0.5,'#F5D8EE'); bg.addColorStop(1,'#EDD0F8');
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

  // Decorative soft circles
  [[-0.3,-0.4,0.22,'#FFD0E8'],[ 0.4,0.2,0.18,'#D8D0FF'],[-0.2,0.5,0.14,'#FFE8C8']].forEach(([dx,dy,r,c])=>{
    const gg = ctx.createRadialGradient(cx+W*dx,cy+H*dy,0,cx+W*dx,cy+H*dy,W*r);
    gg.addColorStop(0,c+'88'); gg.addColorStop(1,'transparent');
    ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(cx+W*dx,cy+H*dy,W*r,0,Math.PI*2); ctx.fill();
  });

  // ── STEP: TEAR ───────────────────────────────────────────
  if (state === ST.TEAR) {
    if (pkg.isOpen) drawPackageOpen(pkg.x, pkg.y, 1);
    else drawPackageClosed(pkg.x, pkg.y, pkg.tearProg);
    // Drag progress updates
    if (tearDrag.active) {
      const dy = tearDrag.currY - tearDrag.startY;
      pkg.tearProg = Math.min(1, Math.max(0, dy / 120));
      if (pkg.tearProg >= 1) {
        pkg.isOpen = true;
        pkg.tearProg = 1;
        tearDrag.active = false;
        score += 100;
        playSound('tear');
        setTimeout(() => {
          state = ST.PICK;
          mask.inPackage = true;
          // Position mask inside open package
          mask.x = pkg.x + PKG.w/2;
          mask.y = pkg.y + PKG.h*0.55;
          setStep(2, 'Step 2 · Pick Up Mask');
          setInstr('Drag the mask out of the package!');
        }, 500);
      }
    }
  }

  // ── STEP: PICK ───────────────────────────────────────────
  if (state === ST.PICK) {
    drawPackageOpen(pkg.x, pkg.y, 1);
    // Show mask peeking out of package
    if (!mask.held) {
      // Subtle float
      const bob = Math.sin(Date.now()*0.003)*4;
      drawMask(mask.x, mask.y + bob, mask.w, mask.h, 0, 0.9, 1.0);
    }
    if (mask.held) {
      drawPackageOpen(pkg.x, pkg.y, 1);
      updateMaskPhysics();
      drawMask(mask.x, mask.y, mask.w, mask.h, mask.rot, mask.alpha, mask.scale);
      // Check if dragged far enough from package
      const outDist = dist(mask.x, mask.y, pkg.x+PKG.w/2, pkg.y+PKG.h*0.5);
      if (outDist > 100) {
        mask.inPackage = false;
        score += 100;
        playSound('pick');
        state = ST.APPLY;
        setStep(3, 'Step 3 · Apply Mask');
        setInstr('Place the mask on the face! Drop it when aligned!');
      }
    }
  }

  // ── STEP: APPLY ──────────────────────────────────────────
  if (state === ST.APPLY) {
    drawFace(face.x, face.y, face.w, face.h);
    if (!mask.placed) drawSnapZone(face.x, face.y, face.w, face.h);
    if (glowOn) drawGlow(face.x, face.y, face.w, face.h, glowAnim);

    if (mask.held) updateMaskPhysics();
    if (mask.placed) animateSnap();

    // Draw mask over face when placed
    const isOverFace = dist(mask.x, mask.y, face.x, face.y) < face.w*0.5;
    if (!mask.placed || isOverFace) {
      drawMask(mask.x, mask.y, mask.w, mask.h, mask.rot, mask.alpha, mask.scale);
    } else {
      drawMask(mask.x, mask.y, mask.w, mask.h, mask.rot, mask.alpha, mask.scale);
    }

    if (!mask.held && !mask.placed) {
      // Gentle drift back toward a resting position if dropped
      mask.vx *= 0.85; mask.vy += 0.3;
      mask.x += mask.vx; mask.y += mask.vy;
      mask.rot = lerp(mask.rot, 0, 0.1);
      // Clamp to canvas
      if (mask.y > H - 40) { mask.y = H - 40; mask.vy *= -0.3; }
    }

    updateDrawParticles();
  }
}

// ─── Input handlers ───────────────────────────────────────────
function onDown(e) {
  e.preventDefault();
  const p = getPos(e);
  mouse = { x:p.x, y:p.y, down:true };
  prevMouseX = p.x; prevMouseY = p.y;

  if (state === ST.TEAR) {
    // Must click near top-right notch of package
    const notchX = pkg.x + PKG.w - 28;
    const notchY = pkg.y + 18;
    if (dist(p.x, p.y, notchX, notchY) < 58) {
      tearDrag.active = true;
      tearDrag.startY = p.y;
      tearDrag.currY  = p.y;
      pkg.tearProg = 0; // always restart from 0
    }
  }

  if (state === ST.PICK) {
    // Grab mask from inside package
    const mx = pkg.x + PKG.w/2;
    const my = pkg.y + PKG.h*0.55;
    if (dist(p.x, p.y, mx, my) < 70) {
      mask.held = true;
      mask.x = mx; mask.y = my;
      mask.vx = 0; mask.vy = 0;
      mask.targetX = p.x; mask.targetY = p.y;
      mask.scale = 1.06;
    }
  }

  if (state === ST.APPLY) {
    if (!mask.placed && dist(p.x, p.y, mask.x, mask.y) < 80) {
      mask.held = true;
      mask.vx = 0; mask.vy = 0;
      mask.targetX = p.x; mask.targetY = p.y;
      mask.scale = 1.06;
    }
  }
}

function onMove(e) {
  e.preventDefault();
  const p = getPos(e);
  mouse = { x:p.x, y:p.y, down:mouse.down };

  if (state === ST.TEAR && tearDrag.active) {
    tearDrag.currY = p.y;
  }

  if ((state === ST.PICK || state === ST.APPLY) && mask.held) {
    mask.targetX = p.x;
    mask.targetY = p.y;
  }
  prevMouseX = p.x; prevMouseY = p.y;
}

function onUp(e) {
  e.preventDefault();
  tearDrag.active = false;

  if ((state === ST.PICK || state === ST.APPLY) && mask.held) {
    mask.held  = false;
    mask.scale = 1.0;
    if (state === ST.APPLY) checkSnap();
  }
}

// ─── Bootstrap ───────────────────────────────────────────────
function startGame() {
  document.getElementById('startScreen').classList.remove('active');
  document.getElementById('completeScreen').classList.remove('active');
  state      = ST.TEAR;
  elapsedSec = 0;
  score      = 0;
  startTime  = Date.now();
  particles  = [];
  pkg.tearProg = 0;
  pkg.isOpen   = false;
  mask.held    = false;
  mask.placed  = false;
  mask.rot     = 0; mask.vx = 0; mask.vy = 0;
  mask.alpha   = 1; mask.scale = 1;
  glowOn = false; glowAnim = 0; snapAnim = 0;

  resize();
  layoutPositions();
  setStep(1, 'Step 1 · Open Package');
  setInstr('Drag the ✂ corner to tear the package open!');
  updateHUD();
  if (!rafId) rafId = requestAnimationFrame(render);
}

function updateBestDisplay() {
  const best = parseInt(localStorage.getItem('maskBest')||'0');
  if (best > 0) {
    document.getElementById('bestWrap').style.display = 'flex';
    document.getElementById('bestVal').textContent = best;
  }
}

// ─── Event listeners ─────────────────────────────────────────
window.addEventListener('resize', () => { resize(); layoutPositions(); });

canvas.addEventListener('mousedown',  onDown, { passive:false });
canvas.addEventListener('mousemove',  onMove, { passive:false });
canvas.addEventListener('mouseup',    onUp,   { passive:false });
canvas.addEventListener('touchstart', onDown, { passive:false });
canvas.addEventListener('touchmove',  onMove, { passive:false });
canvas.addEventListener('touchend',   onUp,   { passive:false });

document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnReplay').addEventListener('click', () => {
  confRunning = false;
  confCtx.clearRect(0,0,confCvs.width,confCvs.height);
  startGame();
});
document.getElementById('btnHome').addEventListener('click', () => {
  confRunning = false;
  confCtx.clearRect(0,0,confCvs.width,confCvs.height);
  document.getElementById('completeScreen').classList.remove('active');
  document.getElementById('startScreen').classList.add('active');
  state = ST.START;
  updateBestDisplay();
});
document.getElementById('btnMusic').addEventListener('click', function() {
  musicOn = !musicOn;
  this.textContent = musicOn ? '🔊 Sound On' : '🔇 Sound Off';
});

// ─── Init ─────────────────────────────────────────────────────
window.addEventListener('load', () => {
  resize();
  layoutPositions();
  updateBestDisplay();
  rafId = requestAnimationFrame(render); // idle render for bg
});
