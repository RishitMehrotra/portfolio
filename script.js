// CUSTOM CURSOR
const cursor = document.getElementById('cursor');
const ring = document.getElementById('cursorRing');
let mx = 0, my = 0, rx = 0, ry = 0;
document.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  if(cursor) cursor.style.transform = `translate(${mx - 5}px, ${my - 5}px)`;
});
function animateRing() {
  rx += (mx - rx - 18) * 0.14; ry += (my - ry - 18) * 0.14;
  if(ring) ring.style.transform = `translate(${rx}px, ${ry}px)`;
  requestAnimationFrame(animateRing);
}
animateRing();

// SCROLL ANIMATIONS (Fade In)
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// HOME BANNER SLIDER
const bannerSlides = document.getElementById('bannerSlides');
if (bannerSlides) {
  let currentSlide = 0;
  let autoSlide = setInterval(() => slideBanner(1), 5000);
  
  window.slideBanner = function(dir) {
    currentSlide = (currentSlide + dir + 2) % 2; // Assuming 2 slides for simplicity here
    bannerSlides.style.transform = `translateX(-${currentSlide * 50}%)`;
    document.querySelectorAll('.banner-dot').forEach((d, i) => d.classList.toggle('active', i === currentSlide));
    clearInterval(autoSlide);
    autoSlide = setInterval(() => slideBanner(1), 5000);
  }
  
  window.goToSlide = function(i) {
    currentSlide = i;
    bannerSlides.style.transform = `translateX(-${currentSlide * 50}%)`;
    document.querySelectorAll('.banner-dot').forEach((d, j) => d.classList.toggle('active', j === currentSlide));
    clearInterval(autoSlide);
    autoSlide = setInterval(() => slideBanner(1), 5000);
  }
}

// PORTFOLIO MODAL LOGIC
const subModal = document.getElementById('subModal');
const modalCategoryName = document.getElementById('modalCategoryName');

window.openSubSections = function(category) {
  if(modalCategoryName && subModal) {
    modalCategoryName.innerText = category;
    
    // Hide all category grids first
    document.querySelectorAll('.category-grid').forEach(grid => grid.classList.remove('active'));

    // Create target ID (e.g. "Graphic Design" -> "grid-Graphic-Design")
    let targetId = 'grid-' + category.replace(/\s+/g, '-');
    let targetGrid = document.getElementById(targetId);
    
    // If exact grid exists, show it
    if(targetGrid) {
      targetGrid.classList.add('active');
    }

    subModal.classList.add('active');
  }
}

window.closeSubSections = function() {
  if(subModal) subModal.classList.remove('active');
}

if(subModal) {
  subModal.addEventListener('click', function(e) {
    if (e.target === subModal) closeSubSections();
  });
}