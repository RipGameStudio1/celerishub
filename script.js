// Инициализация GSAP
gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// Улучшенная функция определения мобильных устройств
function isMobileDevice() {
    return (window.innerWidth <= 768) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0) || 
           (navigator.msMaxTouchPoints > 0);
}

// Инициализация кастомного курсора только для десктопа
function initCustomCursor() {
    if (isMobileDevice()) {
        // Отключаем кастомный курсор на мобильных
        document.querySelector('.cursor')?.remove();
        document.querySelector('.cursor-follower')?.remove();
        
        // Удаляем стиль, скрывающий курсор
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            * {
                cursor: auto !important;
            }
        `;
        document.head.appendChild(styleElement);
        return;
    }
    
    // Кастомный курсор
    const cursor = document.querySelector('.cursor');
    const cursorFollower = document.querySelector('.cursor-follower');
    
    if (!cursor || !cursorFollower) return;
    
    // Создаем и добавляем стиль для скрытия курсора на всех элементах
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        * {
            cursor: none !important;
        }
    `;
    document.head.appendChild(styleElement);

    document.addEventListener('mousemove', function(e) {
        gsap.to(cursor, {
            x: e.clientX,
            y: e.clientY,
            duration: 0
        });
        
        gsap.to(cursorFollower, {
            x: e.clientX,
            y: e.clientY,
            duration: 0.5
        });
    });
    
    // Эффекты для ссылок и кнопок при наведении
    const links = document.querySelectorAll('a, button, .card');
    
    links.forEach(link => {
        link.addEventListener('mouseenter', () => {
            gsap.to(cursor, {
                scale: 2,
                opacity: 0.5,
                duration: 0.3
            });
            
            gsap.to(cursorFollower, {
                scale: 1.5,
                borderColor: 'var(--text-color)',
                duration: 0.3
            });
            
            if (link.getAttribute('data-cursor-text')) {
                cursor.innerHTML = link.getAttribute('data-cursor-text');
                gsap.to(cursor, {
                    width: 'auto',
                    height: 'auto',
                    padding: '10px 15px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    duration: 0
                });
            }
        });
        
        link.addEventListener('mouseleave', () => {
            gsap.to(cursor, {
                scale: 1,
                opacity: 1,
                width: '12px',
                height: '12px',
                padding: 0,
                borderRadius: '50%',
                duration: 0
            });
            
            gsap.to(cursorFollower, {
                scale: 1,
                borderColor: 'var(--text-color)',
                duration: 0.3
            });
            
            cursor.innerHTML = '';
        });
    });
}

// Функция для адаптации интерфейса под мобильные устройства
function adaptForMobile() {
    if (isMobileDevice()) {
        // Сбрасываем высоту и скролл для контейнеров
        document.querySelectorAll('section .container, .hero .container, footer .container').forEach(container => {
            container.style.maxHeight = 'none';
            container.style.overflowY = 'visible';
        });
        
        // Настройка скроллируемых элементов на мобильных
        document.querySelectorAll('[data-mobile="scroll"]').forEach(element => {
            element.style.overflowX = 'auto';
            element.style.WebkitOverflowScrolling = 'touch';
            element.style.scrollbarWidth = 'none'; // Firefox
            
            // Убираем скроллбары для Webkit/Blink
            element.style.msOverflowStyle = 'none'; // IE/Edge
            element.style.scrollbarWidth = 'none'; // Firefox
            
            // Добавляем специальный стиль для скрытия скроллбара в Webkit
            const styleElement = document.createElement('style');
            styleElement.textContent = `
                [data-mobile="scroll"]::-webkit-scrollbar {
                    display: none;
                }
            `;
            document.head.appendChild(styleElement);
        });
        
        // Скрываем блобы на мобильных для лучшей производительности
        const blobCanvas = document.getElementById('blobCanvas');
        if (blobCanvas) {
            blobCanvas.style.opacity = '0.1';
        }
    }
}

// Код для мобильного меню
function initMobileMenu() {
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    
    function openMobileMenu() {
        mobileMenu.classList.add('active');
        mobileMenuOverlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Предотвращаем скролл страницы
    }
    
    function closeMobileMenu() {
        mobileMenu.classList.remove('active');
        mobileMenuOverlay.classList.remove('active');
        document.body.style.overflow = ''; // Восстанавливаем скролл
    }
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', openMobileMenu);
    }
    
    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }
    
    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', closeMobileMenu);
    }
    
    // Закрываем меню при клике на ссылку
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });
}

// Анимация навигации при скролле
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Анимация появления текста
function revealText() {
    const textElements = document.querySelectorAll('.text-reveal');
    textElements.forEach(element => {
        const delay = element.getAttribute('data-delay') || 0;
        gsap.to(element, {
            y: 0,
            duration: 0.8,
            delay: parseFloat(delay),
            ease: "power3.out"
        });
    });
}

// Анимации при скролле
function initScrollAnimations() {
    // Анимация заголовков секций
    gsap.utils.toArray('.section-title').forEach(title => {
        ScrollTrigger.create({
            trigger: title,
            start: "top 80%",
            onEnter: () => {
                gsap.fromTo(title, {
                    y: 50,
                    opacity: 0
                }, {
                    y: 0,
                    opacity: 1,
                    duration: 0.8,
                    ease: "power3.out"
                });
            },
            once: true
        });
    });
    
    // Анимация карточек
    gsap.utils.toArray('.card').forEach((card, index) => {
        ScrollTrigger.create({
            trigger: card,
            start: "top 85%",
            onEnter: () => {
                gsap.fromTo(card, {
                    y: 50,
                    opacity: 0
                }, {
                    y: 0,
                    opacity: 1,
                    duration: 0.8,
                    delay: index * 0.1,
                    ease: "power3.out"
                });
            },
            once: true
        });
    });
    
    // Анимация элементов в блоке "О нас"
    gsap.utils.toArray('.feature').forEach((feature, index) => {
        ScrollTrigger.create({
            trigger: feature,
            start: "top 85%",
            onEnter: () => {
                gsap.fromTo(feature, {
                    y: 30,
                    opacity: 0
                }, {
                    y: 0,
                    opacity: 1,
                    duration: 0.6,
                    delay: index * 0.1,
                    ease: "power3.out"
                });
            },
            once: true
        });
    });
}

// WebGL эффект интерактивных блобов
function initBackgroundEffect(canvasId) {
    const canvas = document.getElementById(canvasId);
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
        console.error('WebGL не поддерживается в этом браузере');
        return;
    }
    
    const vertexShaderSource = `
        attribute vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    const fragmentShaderSource = `
        precision highp float;
        uniform vec2 resolution;
        uniform vec2 blobs[12];  // Увеличено количество блобов
        uniform vec3 blobColors[12];  // Цвета для каждого блоба
        uniform float time;
        uniform bool isDark;
        uniform vec2 mouse;
        uniform bool mouseActive;
    
        float getBlobField(vec2 point, vec2 center, float radius) {
            float dist = length(point - center);
            return radius / dist;
        }
    
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            uv = uv * 2.0 - 1.0;
            uv.x *= resolution.x / resolution.y;
            
            float field = 0.0;
            vec3 mixedColor = vec3(0.0);
            float totalWeight = 0.0;
            
            // Для каждого блоба вычисляем поле и вклад в цвет
            for(int i = 0; i < 12; i++) {
                float blobField = getBlobField(uv, blobs[i], 0.065);  // Увеличен радиус
                field += blobField;
                
                // Для смешивания цветов используем поле как вес
                float weight = pow(blobField, 1.5);
                mixedColor += blobColors[i] * weight;
                totalWeight += weight;
            }
            
            // Нормализуем цвет по общему весу
            vec3 finalColor = mixedColor;
            if (totalWeight > 0.0) {
                finalColor = mixedColor / totalWeight;
            }
            
            // Если мышь активна, добавляем эффект при приближении блобов друг к другу
            if (mouseActive) {
                vec2 mouseUV = mouse / resolution.xy;
                mouseUV = mouseUV * 2.0 - 1.0;
                mouseUV.x *= resolution.x / resolution.y;
                
                float mouseDist = length(uv - mouseUV);
                if (mouseDist < 0.4) {
                    // Усиливаем эффект рядом с мышью
                    field += 0.3 * (0.4 - mouseDist) / 0.4;
                }
            }
            
            float alpha = smoothstep(2.0, 1.5, field) * 0.4;  // Увеличена прозрачность
            
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;

    function createShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Ошибка компиляции шейдера:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Ошибка линковки программы:', gl.getProgramInfoLog(program));
    }

    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, 'resolution');
    const blobsLocation = gl.getUniformLocation(program, 'blobs');
    const blobColorsLocation = gl.getUniformLocation(program, 'blobColors');
    const timeLocation = gl.getUniformLocation(program, 'time');
    const isDarkLocation = gl.getUniformLocation(program, 'isDark');
    const mouseLocation = gl.getUniformLocation(program, 'mouse');
    const mouseActiveLocation = gl.getUniformLocation(program, 'mouseActive');

    // Пастельные цвета в формате RGB (0-1)
    const pastelColors = [
        [0.98, 0.80, 0.85], // Пастельно-розовый
        [0.80, 0.90, 0.98], // Пастельно-голубой
        [0.98, 0.95, 0.80], // Пастельно-желтый
        [0.85, 0.98, 0.85], // Пастельно-зеленый
        [0.90, 0.82, 0.98], // Пастельно-лавандовый
        [0.98, 0.85, 0.75], // Пастельно-персиковый
        [0.85, 0.95, 0.95], // Пастельно-бирюзовый
        [0.95, 0.85, 0.95], // Пастельно-сиреневый
        [0.90, 0.98, 0.90], // Пастельно-мятный
        [0.98, 0.90, 0.90], // Пастельно-коралловый
        [0.88, 0.88, 0.95], // Пастельно-серый
        [0.95, 0.93, 0.85]  // Пастельно-кремовый
    ];

    // Создаем больше блобов и увеличиваем скорость
    const blobs = Array(12).fill().map((_, i) => ({
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        vx: (Math.random() - 0.5) * 0.015, // Увеличенная скорость
        vy: (Math.random() - 0.5) * 0.015, // Увеличенная скорость
        targetVx: (Math.random() - 0.5) * 0.015,
        targetVy: (Math.random() - 0.5) * 0.015,
        color: pastelColors[i % pastelColors.length],
        scale: 0.7 + Math.random() * 0.6, // Разный размер блобов
        lastUpdate: 0
    }));

    // Отслеживание позиции мыши
    const mouse = {
        x: 0,
        y: 0,
        active: false
    };

    document.addEventListener('mousemove', function(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
    });

    document.addEventListener('mouseout', function() {
        mouse.active = false;
    });

    function updateBlobs(time) {
        blobs.forEach(blob => {
            // Чаще меняем направление движения для покрытия всего экрана
            if (time - blob.lastUpdate > 1500) {
                blob.targetVx = (Math.random() - 0.5) * 0.015;
                blob.targetVy = (Math.random() - 0.5) * 0.015;
                blob.lastUpdate = time;
            }
            
            // Плавно меняем текущую скорость в сторону целевой
            blob.vx += (blob.targetVx - blob.vx) * 0.02;
            blob.vy += (blob.targetVy - blob.vy) * 0.02;
            
            blob.x += blob.vx;
            blob.y += blob.vy;

            // Если мышь активна, добавляем влияние на блобы
            if (mouse.active) {
                const mouseX = (mouse.x / canvas.width) * 2 - 1;
                const mouseY = -((mouse.y / canvas.height) * 2 - 1); // WebGL Y координата инвертирована
                
                const dx = mouseX - blob.x;
                const dy = mouseY - blob.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 0.4) {
                    // Мягкое притяжение к курсору
                    const factor = 0.002 * (0.4 - distance) / 0.4;
                    blob.vx += dx * factor;
                    blob.vy += dy * factor;
                }
            }

            // Отражение от краев
            if (Math.abs(blob.x) > 1) {
                blob.vx *= -1;
                blob.x = Math.sign(blob.x);
            }
            if (Math.abs(blob.y) > 1) {
                blob.vy *= -1;
                blob.y = Math.sign(blob.y);
            }
        });
    }

    function resizeCanvas() {
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * pixelRatio;
        canvas.height = window.innerHeight * pixelRatio;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    function render(time) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        updateBlobs(time);

        gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
        gl.uniform1f(timeLocation, time * 0.001);
        gl.uniform1i(isDarkLocation, document.body.classList.contains('dark-theme') ? 1 : 0);
        
        // Передаем позицию мыши в шейдер
        gl.uniform2f(mouseLocation, mouse.x, mouse.y);
        gl.uniform1i(mouseActiveLocation, mouse.active ? 1 : 0);

        // Передаем позиции блобов в шейдер
        const blobPositions = new Float32Array(blobs.flatMap(blob => [blob.x, blob.y]));
        gl.uniform2fv(blobsLocation, blobPositions);
        
        // Передаем цвета блобов в шейдер
        const blobColors = new Float32Array(blobs.flatMap(blob => blob.color));
        gl.uniform3fv(blobColorsLocation, blobColors);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

// Пошаговый скролл - исправленная версия
function initSnapScroll() {
    // Только для десктопа
    if (isMobileDevice()) return;

    // Добавляем ID к секциям, если их нет
    const sections = document.querySelectorAll('section, .hero, footer');
    sections.forEach((section, index) => {
        if (!section.id) {
            section.id = `section-${index}`;
        }
    });
    
    // Только ссылка "P2P сканер" работает как якорь
    document.querySelector('.nav-link[href="#about-section"]').addEventListener('click', function(e) {
        e.preventDefault();
        const targetSection = document.getElementById('about-section');
        
        if (targetSection) {
            gsap.to(window, {
                duration: 0.4,
                scrollTo: {
                    y: targetSection,
                    offsetY: 0
                },
                ease: "power1.out"
            });
        }
    });
    
    // Отключаем действие для других nav-link
    document.querySelectorAll('.nav-link:not([href="#about-section"])').forEach(link => {
        if (link.getAttribute('href') && link.getAttribute('href').startsWith('#')) {
            link.addEventListener('click', function(e) {
                e.preventDefault(); // Просто предотвращаем действие по умолчанию
            });
        }
    });
    
    // Полностью переработанный контроль скролла
    let isScrolling = false;
    let currentIndex = 0;
    const totalSections = sections.length;
    
    // Блокируем стандартный скролл для desktop
    if (!isMobileDevice()) {
        document.body.style.overflow = 'hidden';
    }
    
    // Обновляем текущий индекс на основе позиции скролла
    function updateCurrentIndex() {
        const viewportMiddle = window.scrollY + (window.innerHeight / 2);
        
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const sectionTop = section.offsetTop;
            const sectionBottom = sectionTop + section.offsetHeight;
            
            if (viewportMiddle >= sectionTop && viewportMiddle < sectionBottom) {
                currentIndex = i;
                break;
            }
        }
    }
    
    // Функция для скролла к указанной секции - ускоренная версия
    function scrollToSection(index) {
        if (index < 0) index = 0;
        if (index >= totalSections) index = totalSections - 1;
        
        isScrolling = true;
        
        // Используем GSAP для более надежной анимации - уменьшено время с 1с до 0.4с
        gsap.to(window, {
            duration: 0.4, // Было 1, стало 0.4 - значительно быстрее
            scrollTo: {
                y: sections[index],
                offsetY: 0
            },
            ease: "power1.out", // Более быстрая ease-функция
            onComplete: () => {
                // Уменьшаем время блокировки после скролла
                setTimeout(() => {
                    isScrolling = false;
                }, 50); // Было 200, стало 50
            }
        });
        
        // Обновляем индекс текущей секции
        currentIndex = index;
        updateNavigation();
    }
    
    // Обработчик события скролла колесом мыши (полностью переработанный)
    function wheelHandler(e) {
        // Только для desktop версии
        if (isMobileDevice()) return;
        
        e.preventDefault();
        
        if (isScrolling) return;
        
        // Определяем направление скролла
        if (e.deltaY > 0) {
            // Скролл вниз
            scrollToSection(currentIndex + 1);
        } else {
            // Скролл вверх
            scrollToSection(currentIndex - 1);
        }
    }
    
    // Добавляем обработчик колесика мыши с повышенным приоритетом
    window.addEventListener('wheel', wheelHandler, { passive: false });
    
    // Обработчик для клавиш вверх/вниз
    window.addEventListener('keydown', function(e) {
        // Только для desktop версии
        if (isMobileDevice()) return;
        
        if (isScrolling) return;
        
        // Стрелка вверх или PageUp
        if (e.key === 'ArrowUp' || e.key === 'PageUp') {
            e.preventDefault();
            scrollToSection(currentIndex - 1);
        }
        // Стрелка вниз или PageDown
        else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
            e.preventDefault();
            scrollToSection(currentIndex + 1);
        }
    });
    
    // Индикация активной секции ТОЛЬКО для ссылки "P2P сканер"
    function updateNavigation() {
        // Сначала убираем активный класс у всех ссылок
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Добавляем активный класс только для "#about-section", если активна соответствующая секция
        const aboutLink = document.querySelector('.nav-link[href="#about-section"]');
        if (sections[currentIndex] && sections[currentIndex].id === 'about-section') {
            aboutLink.classList.add('active');
        }
    }
    
    // Обрабатываем изменение размера окна
    window.addEventListener('resize', function() {
        // Проверяем размер устройства
        const mobile = isMobileDevice();
        
        if (mobile) {
            // На мобильных устройствах разрешаем обычный скролл
            document.body.style.overflow = 'auto';
        } else {
            // На десктопе блокируем скролл
            document.body.style.overflow = 'hidden';
            
            // Перепозиционируем на текущую активную секцию
            updateCurrentIndex();
            sections[currentIndex].scrollIntoView();
        }
    });
    
    // Инициализация: определяем текущую секцию и обновляем навигацию
    updateCurrentIndex();
    updateNavigation();
    
    // Устанавливаем начальное позиционирование - без задержки
    if (!isMobileDevice()) {
        sections[0].scrollIntoView({ behavior: "auto" }); // Мгновенный скролл вместо smooth
        isScrolling = false;
    }
}

// Запуск функций при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Сначала проверяем тип устройства
    const isMobile = isMobileDevice();
    
    // Инициализируем с учетом типа устройства
    revealText();
    initScrollAnimations();
    
    // Инициализируем эффекты только на десктопе
    if (!isMobile) {
        initBackgroundEffect('blobCanvas');
        initSnapScroll();
    } else {
        // Применяем специальные адаптации для мобильных устройств
        adaptForMobile();
    }
    
    // Инициализируем кастомный курсор и мобильное меню
    initCustomCursor();
    initMobileMenu();
});
