import { createDog } from './dog.js';
import { setLang, initialLang, texts } from './i18n.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

const PETS = [['dog', 'L-01'], ['cat', 'L-02'], ['rabbit', 'L-03'], ['bird', 'L-04']];

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = window.matchMedia('(max-width: 820px)').matches;
document.documentElement.classList.toggle('is-reduced', reduced);

document.querySelector('.pets__list').innerHTML = PETS.map(([key, code]) => `<article class="pet">
  <img src="assets/img/${code}.webp" data-i18n-alt="pet.${key}.name" loading="lazy">
  <strong data-i18n="pet.${key}.name"></strong>
  <p data-i18n="pet.${key}.text"></p>
</article>`).join('');

let lang = initialLang();
setLang(lang);
document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    setLang(lang);
    ScrollTrigger.refresh();
  });
});

const form = document.querySelector('.form');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  form.querySelector('.form__status').textContent = texts[lang]['form.sent'];
});

// The blob wobbles slowly, like a soft pet breathing
const blobPath = document.querySelector('.blob path');
function drawBlob(time) {
  const n = 8;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 400 + Math.sin(a * 2 + time * 0.5) * 34 + Math.cos(a * 3 - time * 0.34) * 26 + (i % 2 ? 22 : -12);
    pts.push([500 + Math.cos(a) * r * 1.06, 500 + Math.sin(a) * r * 0.96]);
  }
  // Closed smooth curve through the points
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  blobPath.setAttribute('d', d);
}
drawBlob(0);

let dog = null;
try {
  dog = createDog(document.querySelector('.stage'), { isSmall });
  dog.setSpots([...document.querySelectorAll('.spot')]);
} catch (err) {
  // Without WebGL the word, blob and all the text still work
  document.querySelector('.stage').remove();
  console.warn('WebGL is unavailable', err);
}
const state = dog ? dog.state : {};

const pose = isSmall
  ? {
      hero: { x: 0, y: 0.2, rotY: 0.32, camZ: 11.5 },
      hello: { x: 0, y: 1.25, rotY: 0.4, camZ: 11 },
      exam: { x: 0, y: 1.2, rotY: -0.25, camZ: 11 },
      cone: { x: 0, y: 1.2, rotY: 0.55, camZ: 11.5 },
      treat: { x: 0, y: 0.9, rotY: 0.2, camZ: 12 },
    }
  : {
      hero: { x: 0, y: -0.25, rotY: 0.32, camZ: 8.6 },
      hello: { x: 1.2, y: -0.2, rotY: 0.4, camZ: 8 },
      exam: { x: 1.1, y: -0.1, rotY: -0.25, camZ: 7 },
      cone: { x: 1.2, y: -0.2, rotY: 0.55, camZ: 7.8 },
      treat: { x: 1.2, y: -0.45, rotY: 0.2, camZ: 8.6 },
    };
Object.assign(state, pose.hero);

let pinEnd = null;
gsap.ticker.add((time) => {
  if (pinEnd && window.scrollY > pinEnd.end + window.innerHeight) return;
  if (!reduced) drawBlob(time);
  if (dog) dog.frame(reduced ? 3 : time);
});

if (reduced) {
  state.wag = 0;
} else {
  const lenis = new Lenis();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      lenis.scrollTo(a.getAttribute('href') === '#top' ? 0 : a.getAttribute('href'));
    });
  });

  intro();
  story();
  navOnScroll();
}

// The one load moment: the doodles draw themselves, the dog sits up
function intro() {
  const lines = gsap.utils.toArray('.doodle path');
  gsap.set(lines, { strokeDasharray: 1, strokeDashoffset: 1 });
  gsap.to(lines, { strokeDashoffset: 0, duration: 1.4, stagger: 0.12, ease: 'power1.inOut', delay: 0.2 });
  gsap.fromTo('.blob', { scale: 0.6 }, { scale: 1, duration: 1.4, ease: 'elastic.out(1, 0.7)' });
  gsap.from('.intro > *', { opacity: 0, y: 16, duration: 0.8, delay: 0.5, ease: 'power2.out' });
  if (dog) gsap.from(state, { y: pose.hero.y - 3.4, duration: 1.2, ease: 'back.out(1.4)' });
}

function story() {
  const panels = gsap.utils.toArray('.panel');
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: { trigger: '.scene__pin', start: 'top top', end: '+=600%', pin: true, scrub: 0.6 },
  });
  pinEnd = tl.scrollTrigger;

  const show = (el, at) => tl.fromTo(el, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.4 }, at);
  const hide = (el, at) => tl.to(el, { autoAlpha: 0, y: -20, duration: 0.4 }, at);
  const move = (from, to, at, extra = {}) => tl.fromTo(state, { ...from }, { ...to, ...extra, duration: 1, immediateRender: false }, at);

  tl.to('.intro', { autoAlpha: 0, duration: 0.3 }, 0);
  tl.to('.doodle', { autoAlpha: 0, duration: 0.3 }, 0);
  tl.fromTo('.word', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.4, immediateRender: false }, 0.1);
  move(pose.hero, pose.hello, 0);
  if (!isSmall) tl.to('.blob', { xPercent: 34, duration: 1 }, 0);
  else tl.to('.blob', { yPercent: -16, duration: 1 }, 0);
  show(panels[0], 0.7);
  hide(panels[0], 1.8);

  // Exam: each spot lights up in turn
  move(pose.hello, pose.exam, 1.8);
  show(panels[1], 2.3);
  ['ear', 'teeth', 'heart', 'paw'].forEach((name, i) => {
    tl.fromTo(state, { [name]: 0 }, { [name]: 1, duration: 0.2, immediateRender: false }, 2.5 + i * 0.3);
  });
  hide(panels[1], 3.8);
  tl.to(state, { ear: 0, teeth: 0, heart: 0, paw: 0, duration: 0.3 }, 3.8);

  // Surgery: cone on, no more wiggling
  move(pose.exam, pose.cone, 3.8);
  tl.to(state, { cone: 1, bandage: 1, wag: 0, duration: 0.5, ease: 'back.out(1.6)' }, 4.1);
  show(panels[2], 4.3);
  hide(panels[2], 5.4);

  // Treat: everything comes off and the blob fills the room
  tl.to(state, { cone: 0, bandage: 0, wag: 1.3, duration: 0.4 }, 5.4);
  tl.to(state, { bone: 1, hop: 1, duration: 0.5, ease: 'back.out(2)' }, 5.6);
  move(pose.cone, pose.treat, 5.4);
  tl.fromTo('.blob', { scale: 1 }, { scale: isSmall ? 5 : 3.6, xPercent: 0, yPercent: 0, duration: 1.1, immediateRender: false }, 5.5);
  show(panels[3], 6);
  tl.to({}, { duration: 0.8 }, 6.6);
}

function navOnScroll() {
  const nav = document.querySelector('.nav');
  ScrollTrigger.create({
    start: () => window.innerHeight,
    end: 'max',
    onUpdate: (self) => nav.classList.toggle('is-hidden', self.direction === 1),
    onLeaveBack: () => nav.classList.remove('is-hidden'),
  });
}
