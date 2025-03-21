// Глобальные константы и настройки
const API_URL = 'https://underground-mia-slimeapp-847f161d.koyeb.app';

// Глобальные переменные состояния
let currentView = 'treemap'; // Текущий вид: treemap, grid, list
let currentSortField = 'spread'; // Поле для сортировки: coin, network, spread, profit
let currentSortOrder = 'desc'; // Порядок сортировки: asc, desc
let updateInterval = null; // Интервал автоматического обновления
let pairsData = []; // Данные о торговых парах
let filteredPairsData = []; // Отфильтрованные данные
let isDetailsPanelOpen = false; // Открыта ли панель деталей
let currentUser = null; // Данные о текущем пользователе
let currentDetailsPairId = null; // ID пары, отображаемой в панели деталей
let detailsPanelTimerId = null; // ID таймера для панели деталей
let timerUpdatesInterval = null; // Интервал обновления всех таймеров
let lastWindowWidth = window.innerWidth; // Для отслеживания изменений размера окна
let buyExchanges = []; // Список бирж покупки
let sellExchanges = []; // Список бирж продажи

// Цветовая схема для тепловой карты
const HEAT_COLORS = {
    cold: 'var(--heat-cold-1)',     // Спред < 0.5%
    cool: 'var(--heat-cold-2)',     // Спред 0.5-1%
    warm: 'var(--heat-warm-1)',     // Спред 1-2%
    warmer: 'var(--heat-warm-2)',   // Спред 2-3%
    hot: 'var(--heat-hot-1)',       // Спред 3-5%
    veryHot: 'var(--heat-hot-2)'    // Спред > 5%
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async function() {
    // Загрузка DOM элементов
    setupDOMElements();
    
    // Инициализация пользователя - если не авторизован, остальной код не выполняется
    const isAuthenticated = await initializeUser();
    if (!isAuthenticated) return;
    // Настройка начальных значений ползунков
    setupRangeSliders();
    
    // Замена блока группировки на блок сортировки
    replaceSortingControls();

    // Убедимся, что стили анимации добавлены
    ensureRefreshButtonStyle();
    
    // Добавление кнопок сворачивания для блоков фильтров
    setupCollapsibleFilterGroups();
    
    // Установка обработчиков событий
    setupEventListeners();
    
    // Загрузка бирж и монет
    await loadExchangesAndCoins();
    
    // Первоначальная загрузка данных
    await fetchData();
    
    // Запуск обновления таймеров
    startTimerUpdates();
    
    // Установка интервала обновления данных
    startAutoUpdate(10); // По умолчанию 10 секунд
    
    // Обработчик изменения размера окна
    window.addEventListener('resize', handleWindowResize);
    
    // Настройка мобильных контролей
    setupMobileFilterToggle();
    
    // Улучшение представления списка
    enhanceListView();
    
    // Проверяем доступность режима list
    checkListViewAvailability();
    
    // Исправляем ползунок объема
    fixVolumeSlider();
});

// API функции
const api = {
    baseUrl: 'https://underground-mia-slimeapp-847f161d.koyeb.app',
    
    // Храним статус ошибок для каждого эндпоинта
    _errorStatus: {}, 
    
    // Функция-помощник для выполнения запросов с интеллектуальным повтором
    async fetchWithRetry(url, options = {}, maxRetries = 3) {
        // Проверяем, не находится ли эндпоинт в состоянии ошибки
        const endpoint = url.split('?')[0]; // Удаляем query parameters для проверки
        const currentTime = Date.now();
        
        if (this._errorStatus[endpoint]) {
            const { errorUntil, errorCount } = this._errorStatus[endpoint];
            
            // Если не прошло достаточно времени с момента последней ошибки, пропускаем запрос
            if (currentTime < errorUntil) {
                console.warn(`Skipping request to ${endpoint.split('/').slice(-2).join('/')} due to recent errors. Retry in ${Math.ceil((errorUntil - currentTime)/1000)}s`);
                throw new Error('API endpoint temporarily disabled due to errors');
            }
        }
        
        let lastError;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Добавляем таймаут для предотвращения бесконечного ожидания
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 секунд таймаут
                
                const fullOptions = {
                    ...options,
                    signal: controller.signal
                };
                
                // Минимальное логирование для повторных запросов
                if (attempt > 0) {
                    console.log(`Retry ${attempt}/${maxRetries} for: ${url.split('/').slice(-2).join('/')}`);
                }
                
                const response = await fetch(url, fullOptions);
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    // Для 5xx ошибок (ошибки сервера) обрабатываем особо
                    if (response.status >= 500) {
                        this._registerEndpointError(endpoint);
                        throw new Error(`Server Error: ${response.status}`);
                    }
                    throw new Error(`HTTP Error: ${response.status}`);
                }
                
                // Сбрасываем счетчик ошибок для этого эндпоинта при успехе
                this._resetEndpointError(endpoint);
                
                const data = await response.json();
                return data;
            } catch (error) {
                lastError = error;
                
                // Для серверных ошибок делаем увеличенную задержку
                const isServerError = error.message.includes('Server Error') || 
                                     error.message.includes('500');
                
                if (error.name === 'AbortError') {
                    console.warn('Request timed out');
                }
                
                // Задержка перед повторной попыткой (экспоненциальное увеличение)
                if (attempt < maxRetries - 1) {
                    // Базовая задержка 1 секунда, увеличивается экспоненциально
                    // для серверных ошибок используем увеличенную задержку
                    const baseDelay = isServerError ? 3000 : 1000;
                    const delay = baseDelay * Math.pow(2, attempt);
                    // Случайный компонент для предотвращения "грозди запросов"
                    const jitter = Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay + jitter));
                }
            }
        }
        
        // Регистрируем ошибку эндпоинта после всех неудачных попыток
        this._registerEndpointError(endpoint);
        
        // Минимизируем логирование ошибок
        console.error(`API request failed for: ${url.split('/').slice(-2).join('/')}`);
        return { success: false, error: lastError?.message || 'Unknown error' };
    },
    
    // Регистрация ошибки эндпоинта
    _registerEndpointError(endpoint) {
        const currentData = this._errorStatus[endpoint] || { errorCount: 0, errorUntil: 0 };
        const newErrorCount = currentData.errorCount + 1;
        
        // Устанавливаем временное отключение с возрастающим периодом
        // Начинаем с 10 секунд, но увеличиваем до 5 минут при множественных ошибках
        let disablePeriod = Math.min(10000 * Math.pow(2, Math.min(newErrorCount - 1, 4)), 300000);
        
        this._errorStatus[endpoint] = {
            errorCount: newErrorCount,
            errorUntil: Date.now() + disablePeriod
        };
    },
    
    // Сброс ошибки эндпоинта
    _resetEndpointError(endpoint) {
        if (this._errorStatus[endpoint]) {
            delete this._errorStatus[endpoint];
        }
    },

    // ---------- Методы для работы с пользователями ----------
    
    // Получение информации о пользователе
    async getUser(telegramId) {
        try {
            const url = `${this.baseUrl}/users/${telegramId}`;
            const data = await this.fetchWithRetry(url);
            if (!data.success && data.error) {
                throw new Error(`User not found: ${data.error}`);
            }
            return data;
        } catch (error) {
            console.error('Failed to get user:', error.message);
            throw new Error(`User not found: ${error.message}`);
        }
    },

    // Создание нового пользователя
    async createUser(telegramId, username) {
        try {
            const url = `${this.baseUrl}/users/${telegramId}?username=${encodeURIComponent(username || 'unknown')}`;
            const data = await this.fetchWithRetry(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (!data.success && data.error) {
                throw new Error(`Failed to create user: ${data.error}`);
            }
            return data;
        } catch (error) {
            console.error('Failed to create user:', error.message);
            throw new Error(`Failed to create user: ${error.message}`);
        }
    },

    // ---------- Методы для работы с лицензиями ----------
    
    // Оптимизированная функция для периодических проверок лицензии
    licenseCheckStatus: {
        inProgress: false,
        lastCheck: 0,
        errorCount: 0,
        nextCheckDelay: 60000 // начальная задержка 1 минута
    },
    
    // Проверка лицензии с троттлингом
    async checkLicenseWithThrottling(telegramId) {
        // Избегаем параллельных проверок
        if (this.licenseCheckStatus.inProgress) {
            return null;
        }
        
        // Проверяем, не слишком ли рано для повторной проверки
        const now = Date.now();
        const timeSinceLastCheck = now - this.licenseCheckStatus.lastCheck;
        
        if (timeSinceLastCheck < this.licenseCheckStatus.nextCheckDelay) {
            return null;
        }
        
        try {
            this.licenseCheckStatus.inProgress = true;
            this.licenseCheckStatus.lastCheck = now;
            
            const licenseData = await this.getUserLicense(telegramId);
            
            // Сбрасываем счетчик ошибок и возвращаем задержку к норме при успехе
            if (licenseData && licenseData.license) {
                this.licenseCheckStatus.errorCount = 0;
                this.licenseCheckStatus.nextCheckDelay = 60000; // 1 минута при нормальной работе
                return licenseData;
            }
            
            throw new Error("Invalid license data");
        } catch (error) {
            // Увеличиваем счетчик ошибок и задержку между проверками
            this.licenseCheckStatus.errorCount++;
            
            // Экспоненциальное увеличение времени до следующей проверки (максимум 15 минут)
            const baseDelay = 60000; // 1 минута
            this.licenseCheckStatus.nextCheckDelay = Math.min(
                baseDelay * Math.pow(2, this.licenseCheckStatus.errorCount - 1),
                900000 // 15 минут максимум
            );
            
            return null;
        } finally {
            this.licenseCheckStatus.inProgress = false;
        }
    },
    
    // Получение информации о лицензии пользователя
    async getUserLicense(telegramId) {
        try {
            const url = `${this.baseUrl}/users/${telegramId}/license`;
            const data = await this.fetchWithRetry(url);
            if (data.success === false) {
                console.warn("Failed to get license data");
                return { success: false, license: null };
            }
            return data;
        } catch (error) {
            // Минимизируем логирование
            return { success: false, license: null };
        }
    },

    // Обновление лицензии пользователя
    async updateUserLicense(telegramId, licenseData) {
        try {
            const url = `${this.baseUrl}/users/${telegramId}/license`;
            const data = await this.fetchWithRetry(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(licenseData)
            });
            return data;
        } catch (error) {
            return { success: false };
        }
    },
    
    // ---------- Методы для работы с торговыми парами и биржами ----------
    
    // Получение списка бирж
    async getExchanges() {
        try {
            const url = `${this.baseUrl}/exchanges`;
            const data = await this.fetchWithRetry(url);
            return data;
        } catch (error) {
            console.warn('Failed to get exchanges');
            return [];
        }
    },

    // Получение списка монет
    async getCoins() {
        try {
            const url = `${this.baseUrl}/coins`;
            const data = await this.fetchWithRetry(url);
            return data;
        } catch (error) {
            console.warn('Failed to get coins');
            return [];
        }
    },

    // Получение торговых пар
    async getPairs(userId = null) {
        try {
            const url = userId ? `${this.baseUrl}/pairs?user_id=${userId}` : `${this.baseUrl}/pairs`;
            const data = await this.fetchWithRetry(url);
            return data;
        } catch (error) {
            console.warn('Failed to get pairs');
            return { active_pairs: [] };
        }
    },

    // Закрепление торговой пары
    async pinPair(pairId, userId) {
        if (!userId) {
            return { success: false, message: 'User ID required' };
        }
        
        try {
            const url = `${this.baseUrl}/pairs/${pairId}/pin?user_id=${userId}`;
            const data = await this.fetchWithRetry(url, {
                method: 'POST'
            });
            return data;
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    // Открепление торговой пары
    async unpinPair(pairId, userId) {
        if (!userId) {
            return { success: false, message: 'User ID required' };
        }
        
        try {
            const url = `${this.baseUrl}/pairs/${pairId}/pin?user_id=${userId}`;
            const data = await this.fetchWithRetry(url, {
                method: 'DELETE'
            });
            return data;
        } catch (error) {
            return { success: false, message: error.message };
        }
    },
    
    // ---------- Методы для работы с настройками пользователя ----------
    
    // Получение настроек пользователя
    async getUserSettings(telegramId) {
        try {
            const url = `${this.baseUrl}/users/${telegramId}/settings`;
            const data = await this.fetchWithRetry(url);
            return data;
        } catch (error) {
            return { success: false, settings: {} };
        }
    },

    // Обновление настроек пользователя с интеллектуальной обработкой ошибок
    async updateUserSettings(telegramId, settings) {
        try {
            // Проверяем, не отключен ли эндпоинт
            const endpoint = `${this.baseUrl}/users/${telegramId}/settings`;
            if (this._errorStatus[endpoint]) {
                const { errorUntil } = this._errorStatus[endpoint];
                if (Date.now() < errorUntil) {
                    // Возвращаем временное "успех" чтобы не блокировать UI
                    console.warn("Settings update skipped: endpoint temporarily disabled");
                    return { success: true, localOnly: true };
                }
            }
            
            const data = await this.fetchWithRetry(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            return data;
        } catch (error) {
            // Возвращаем временный "успех" для сохранения настроек локально
            return { success: true, localOnly: true };
        }
    },
    
    // ---------- Вспомогательные методы ----------
    
    // Обновление последней активности пользователя
    async updateLastActive(telegramId) {
        try {
            const url = `${this.baseUrl}/users/${telegramId}/last_active`;
            const data = await this.fetchWithRetry(url, {
                method: 'PUT'
            });
            return data;
        } catch (error) {
            // Неудача не критична
            return { success: false };
        }
    },
    
    // Получение уведомлений пользователя
    async getUserNotifications(telegramId) {
        try {
            const url = `${this.baseUrl}/users/${telegramId}/notifications`;
            const data = await this.fetchWithRetry(url);
            return data;
        } catch (error) {
            return { notifications: [] };
        }
    },
    
    // Обновление настроек уведомлений
    async updateNotificationSettings(telegramId, settings) {
        try {
            const url = `${this.baseUrl}/users/${telegramId}/notification_settings`;
            const data = await this.fetchWithRetry(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            return data;
        } catch (error) {
            return { success: false };
        }
    },
    
    // Сброс всех ошибок эндпоинтов (например, при возобновлении соединения)
    resetAllErrorStatus() {
        this._errorStatus = {};
        this.licenseCheckStatus.errorCount = 0;
        this.licenseCheckStatus.nextCheckDelay = 60000;
        console.log("API error status reset");
    },
    
    // Проверка состояния сети и сброс статусов ошибок при восстановлении
    startNetworkMonitoring() {
        window.addEventListener('online', () => {
            console.log("Network connection restored");
            this.resetAllErrorStatus();
        });
    }
};


// Простой и надежный механизм проверки лицензии в фоне
const licenseChecker = {
    // Интервал проверки
    checkInterval: null,
    
    // Время между проверками (5 минут)
    checkFrequency: 5 * 1000,
    
    // Флаг для отслеживания первой проверки
    isFirstCheck: true,
    
    // Запуск периодической проверки
    startChecking(userId) {
        console.log('🔍 License Checker: Запуск механизма проверки лицензии');
        
        if (!userId) {
            console.error('❌ License Checker: Невозможно запустить проверку - отсутствует ID пользователя');
            return;
        }
        
        
        // Останавливаем предыдущую проверку, если она была
        this.stopChecking();
        
        // Функция для выполнения проверки
        const performCheck = async () => {
    const isFirst = this.isFirstCheck;
    if (isFirst) {
        this.isFirstCheck = false;
        console.log('License Checker: Выполняется первоначальная проверка лицензии');
    } else {
        console.log('License Checker: Выполняется периодическая проверка лицензии');
    }
    
    try {
        // Проверяем, доступен ли объект currentUser
        if (!currentUser) {
            console.warn('⚠️ License Checker: Объект currentUser недоступен, пропуск проверки');
            return;
        }
        
        // Запрос к API с таймаутом
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        
        const response = await Promise.race([
            api.getUserLicense(userId),
            timeoutPromise
        ]);
        
        
        // ИСПРАВЛЕНО: Проверяем, является ли ответ объектом лицензии
        // Определяем, является ли ответ объектом лицензии, проверяя наличие нужных полей
        const licenseData = response.license || response; // Сначала проверяем старый формат, затем новый
        
        if (licenseData && typeof licenseData === 'object' && 
            ('type' in licenseData) && ('is_active' in licenseData)) {
            // Проверяем, изменилась ли лицензия
            this._checkLicenseChanges(licenseData);
        } else {
            console.warn('⚠️ License Checker: Получен некорректный ответ от API (нет данных о лицензии)');
            console.debug('Содержимое ответа:', response);
        }
    } catch (error) {
        console.error('❌ License Checker: Ошибка при проверке лицензии:', error.message);
        if (error.stack) {
            console.debug('Стек ошибки:', error.stack);
        }
    }
};
        
        // Запускаем периодическую проверку
        this.checkInterval = setInterval(performCheck, this.checkFrequency);
        
        // Выполняем первую проверку сразу
        performCheck();
    },
    
    // Остановка проверки
    stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    },
    
    // Проверка изменений лицензии
    _checkLicenseChanges(newLicense) {
        
        if (!currentUser) {
            return;
        }
        
        if (!currentUser.license) {
            currentUser.license = newLicense;
            updateLicenseStatus(newLicense);
            enforceLicenseRestrictions();
            return;
        }
        
        const oldLicense = currentUser.license;
        
        // Проверяем основные изменения
        const typeChanged = oldLicense.type !== newLicense.type;
        const statusChanged = oldLicense.is_active !== newLicense.is_active;
        
        if (typeChanged || statusChanged) {
            console.log('🔄 License Checker: Обнаружены изменения в лицензии!');
            
            // Обновляем лицензию пользователя
            currentUser.license = newLicense;
            
            // Обновляем отображение в интерфейсе
            try {
                updateLicenseStatus(newLicense);
            } catch (error) {
                console.error('❌ License Checker: Ошибка при обновлении отображения:', error);
            }
            
            // Проверяем доступ к функциям
            try {
                enforceLicenseRestrictions();
            } catch (error) {
                console.error('❌ License Checker: Ошибка при применении ограничений:', error);
            }
            
            // Показываем соответствующее уведомление
            try {
                console.log('🔔 License Checker: Отображение уведомления об изменении лицензии');
                this._showLicenseChangeNotification(oldLicense, newLicense);
            } catch (error) {
                console.error('❌ License Checker: Ошибка при отображении уведомления:', error);
            }
        } else {
            console.log('✅ License Checker: Изменений в лицензии не обнаружено');
        }
    },
    
    // Показ уведомления об изменении лицензии
    _showLicenseChangeNotification(oldLicense, newLicense) {
        
        if (newLicense.type === "Free") {
            showNotification('Ваша лицензия изменилась на Free. Доступ ограничен.', 'warning');
            if (!document.querySelector('.license-purchase-notification')) {
                showLicensePurchaseNotification();
            }
        } else if (newLicense.is_active && !oldLicense.is_active) {
            showNotification('Ваша лицензия активирована!', 'success');
        } else if (!newLicense.is_active && oldLicense.is_active) {
            showNotification('Ваша лицензия деактивирована.', 'warning');
        }
    }
};

// Функция перенаправления на страницу входа
function redirectToLogin() {
    // Показываем блокирующее сообщение
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        appContainer.innerHTML = `
            <div class="auth-required">
                <div class="auth-message">
                    <h2>Требуется авторизация</h2>
                    <p>Пожалуйста, откройте приложение через Telegram для авторизации.</p>
                    <button id="retryAuth" class="auth-btn">Попробовать снова</button>
                </div>
            </div>
        `;
        
        // Добавляем стили для экрана авторизации
        const style = document.createElement('style');
        style.textContent = `
            .auth-required {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: var(--bg-primary);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            }
            
            .auth-message {
                background-color: var(--bg-secondary);
                padding: 30px;
                border-radius: var(--border-radius);
                text-align: center;
                max-width: 80%;
                box-shadow: var(--shadow-md);
            }
            
            .auth-message h2 {
                margin-bottom: 15px;
                color: var(--text-primary);
            }
            
            .auth-message p {
                margin-bottom: 20px;
                color: var(--text-secondary);
            }
            
            .auth-btn {
                background-color: var(--accent-blue);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: var(--border-radius);
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            
            .auth-btn:hover {
                background-color: #1756ff;
            }
        `;
        document.head.appendChild(style);
        
        // Обработчик для кнопки повторной авторизации
        const retryBtn = document.getElementById('retryAuth');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                location.reload();
            });
        }
    }
}

// Инициализация пользователя
// Инициализация пользователя
async function initializeUser() {
    console.log('🚀 Начало инициализации пользователя');
    
    // Проверяем доступность Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        try {
            
            // Получаем данные пользователя из Telegram
            const telegramUser = window.Telegram.WebApp.initDataUnsafe.user;
            
            if (telegramUser) {
                console.log('📱 Данные пользователя Telegram получены:', 
                            `ID:${telegramUser.id}, Username:${telegramUser.username || 'не указан'}`);
                
                try {
                    // Пытаемся получить существующего пользователя
                    console.log(`📡 Запрос данных пользователя с ID:${telegramUser.id} с сервера`);
                    
                    currentUser = await api.getUser(telegramUser.id.toString());
                    
                    // Обновляем отображение имени пользователя
                    if (window.DOM.username) {
                        window.DOM.username.textContent = '@' + (telegramUser.username || 'user');
                    }
                    
                    // Обновляем статус лицензии
                    updateLicenseStatus(currentUser.license);
                    
                    // Проверяем наличие доступа к данным
                    const hasAccess = hasAccessToTradingPairs();
                    console.log("👮 Доступ пользователя к торговым парам:", hasAccess ? "Разрешен" : "Запрещен");
                    
                    // Если нет доступа, сразу очищаем данные и обновляем интерфейс
                    if (!hasAccess) {
                        pairsData = [];
                        filteredPairsData = [];
                        updateStatistics();
                        renderHeatmap();
                    }
                    
                    // Загружаем сохраненные настройки пользователя
                    loadUserSettings();
                    
                    // Настраиваем слушатели для сохранения настроек
                    setupSettingsSaveListeners();
                    
                    // Запускаем проверку лицензии в фоновом режиме
                    try {
                        licenseChecker.startChecking(currentUser.telegram_id);
                    } catch (error) {
                        console.error("❌ Ошибка при запуске проверки лицензии:", error);
                    }
                    
                    return true; // Успешная аутентификация
                    
                } catch (error) {
                    // Если пользователь не найден, создаем нового
                    
                    const username = telegramUser.username || telegramUser.first_name || 'unknown';
                    console.log('🆕 Создание нового пользователя:', {
                        id: telegramUser.id.toString(),
                        username: username
                    });

                    // Создаем нового пользователя через API
                    try {
                        currentUser = await api.createUser(telegramUser.id.toString(), username);
                        
                        if (window.DOM.username) {
                            window.DOM.username.textContent = '@' + username;
                        }
                        
                        // Обновляем статус лицензии для нового пользователя
                        updateLicenseStatus(currentUser.license);
                        
                        // Настраиваем слушатели для сохранения настроек
                        setupSettingsSaveListeners();
                        
                        // Запускаем проверку лицензии в фоновом режиме
                        try {
                            licenseChecker.startChecking(currentUser.telegram_id);
                        } catch (error) {
                            console.error("❌ Ошибка при запуске проверки лицензии:", error);
                        }
                        
                        return true; // Успешная аутентификация
                        
                    } catch (createError) {
                        console.error("❌ Ошибка при создании пользователя:", createError);
                        throw createError;
                    }
                }
            } else {
                console.error("❌ Данные пользователя Telegram отсутствуют в WebApp");
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации пользователя Telegram:', error);
        }
    } else {
        console.error("❌ Telegram WebApp не обнаружен");
    }
    
    // Если пользователь не авторизован, перенаправляем на страницу входа
    console.log("⚠️ Авторизация не удалась, перенаправление на экран входа");
    redirectToLogin();
    return false;
}


// Функция для загрузки настроек пользователя
function loadUserSettings() {
    if (!currentUser || !currentUser.settings) return;
    
    const settings = currentUser.settings;
    
    // Загружаем выбранные монеты
    if (settings.selected_coins && Array.isArray(settings.selected_coins)) {
        // Найдем все теги монет и установим соответствующие активными
        const coinTags = document.querySelectorAll('.coin-tag:not(.all-coins-btn)');
        coinTags.forEach(tag => {
            const coinSymbol = tag.dataset.coin;
            if (settings.selected_coins.includes(coinSymbol)) {
                tag.classList.add('active');
            } else {
                tag.classList.remove('active');
            }
        });
        
        // Проверяем, выбраны ли все монеты для кнопки "Все монеты"
        const allCoinsBtn = document.querySelector('.all-coins-btn');
        if (allCoinsBtn) {
            const allCoins = document.querySelectorAll('.coin-tag:not(.all-coins-btn)');
            allCoinsBtn.classList.toggle('active', settings.selected_coins.length === allCoins.length);
        }
    }
    
    // Загружаем выбранные биржи покупки
    if (settings.selected_buy_exchanges && Array.isArray(settings.selected_buy_exchanges)) {
        // Найдем все теги бирж покупки и установим соответствующие активными
        const buyExchangeTags = document.querySelectorAll('.buy-exchanges .exchange-tag:not(.all-exchanges-btn)');
        buyExchangeTags.forEach(tag => {
            const exchangeSymbol = tag.dataset.exchange;
            if (settings.selected_buy_exchanges.includes(exchangeSymbol)) {
                tag.classList.add('active');
            } else {
                tag.classList.remove('active');
            }
        });
        
        // Проверяем, выбраны ли все биржи покупки для кнопки "Все биржи"
        const allBuyExchangesBtn = document.querySelector('.buy-exchanges .all-exchanges-btn');
        if (allBuyExchangesBtn) {
            const allBuyExchanges = document.querySelectorAll('.buy-exchanges .exchange-tag:not(.all-exchanges-btn)');
            allBuyExchangesBtn.classList.toggle('active', settings.selected_buy_exchanges.length === allBuyExchanges.length);
        }
    }
    
    // Загружаем выбранные биржи продажи
    if (settings.selected_sell_exchanges && Array.isArray(settings.selected_sell_exchanges)) {
        // Найдем все теги бирж продажи и установим соответствующие активными
        const sellExchangeTags = document.querySelectorAll('.sell-exchanges .exchange-tag:not(.all-exchanges-btn)');
        sellExchangeTags.forEach(tag => {
            const exchangeSymbol = tag.dataset.exchange;
            if (settings.selected_sell_exchanges.includes(exchangeSymbol)) {
                tag.classList.add('active');
            } else {
                tag.classList.remove('active');
            }
        });
        
        // Проверяем, выбраны ли все биржи продажи для кнопки "Все биржи"
        const allSellExchangesBtn = document.querySelector('.sell-exchanges .all-exchanges-btn');
        if (allSellExchangesBtn) {
            const allSellExchanges = document.querySelectorAll('.sell-exchanges .exchange-tag:not(.all-exchanges-btn)');
            allSellExchangesBtn.classList.toggle('active', settings.selected_sell_exchanges.length === allSellExchanges.length);
        }
    }
    
    // Загружаем интервал обновления
    if (settings.update_interval) {
        const interval = parseInt(settings.update_interval.$numberInt || settings.update_interval);
        if (!isNaN(interval)) {
            // Находим и устанавливаем соответствующую кнопку активной
            const intervalButtons = document.querySelectorAll('.interval-btn');
            intervalButtons.forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.interval) === interval);
            });
            
            // Запускаем интервал обновления
            startAutoUpdate(interval);
        }
    }
    
    // Загружаем настройки диапазона спреда
    if (settings.spread_min !== undefined && settings.spread_max !== undefined) {
        try {
            const minSpread = parseFloat(settings.spread_min.$numberDouble || settings.spread_min);
            const maxSpread = parseFloat(settings.spread_max.$numberDouble || settings.spread_max);
            
            if (!isNaN(minSpread) && !isNaN(maxSpread)) {
                window.DOM.spreadMin.value = minSpread;
                window.DOM.spreadMax.value = maxSpread;
                window.DOM.spreadMinVal.textContent = minSpread.toFixed(1) + '%';
                window.DOM.spreadMaxVal.textContent = maxSpread.toFixed(1) + '%';
            }
        } catch (e) {
            console.error('Error loading spread range:', e);
        }
    }
    
    // Загружаем настройки диапазона объема
    if (settings.volume_min !== undefined && settings.volume_max !== undefined) {
        try {
            const minVolume = parseFloat(settings.volume_min.$numberInt || settings.volume_min);
            const maxVolume = parseFloat(settings.volume_max.$numberInt || settings.volume_max);
            
            if (!isNaN(minVolume) && !isNaN(maxVolume)) {
                window.DOM.volumeMin.value = minVolume;
                window.DOM.volumeMax.value = maxVolume;
                window.DOM.volumeMinVal.textContent = formatCurrency(minVolume);
                window.DOM.volumeMaxVal.textContent = formatCurrency(maxVolume);
            }
        } catch (e) {
            console.error('Error loading volume range:', e);
        }
    }
    
    // Загружаем настройки диапазона времени
    if (settings.time_min !== undefined && settings.time_max !== undefined) {
        try {
            const minTime = parseFloat(settings.time_min.$numberInt || settings.time_min);
            const maxTime = parseFloat(settings.time_max.$numberInt || settings.time_max);
            
            if (!isNaN(minTime) && !isNaN(maxTime)) {
                window.DOM.timeMin.value = minTime;
                window.DOM.timeMax.value = maxTime;
                window.DOM.timeMinVal.textContent = minTime.toString();
                window.DOM.timeMaxVal.textContent = maxTime.toString();
            }
        } catch (e) {
            console.error('Error loading time range:', e);
        }
    }
    
    // Загружаем режим просмотра
    if (settings.view_mode) {
        const viewMode = settings.view_mode;
        // Проверяем, доступен ли режим list при текущей ширине экрана
        let canUseList = window.innerWidth > 840 || viewMode !== 'list';
        
        if (canUseList && ['treemap', 'grid', 'list'].includes(viewMode)) {
            currentView = viewMode;
            
            // Устанавливаем активную кнопку
            window.DOM.viewButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === viewMode);
            });
            
            // Показываем соответствующий вид
            document.querySelectorAll('.heatmap-view').forEach(view => {
                view.classList.toggle('active', view.id === viewMode + 'View');
            });
        }
    }
    
    // Загружаем настройки сортировки
    if (settings.sort_field && settings.sort_order) {
        currentSortField = settings.sort_field;
        currentSortOrder = settings.sort_order;
        
        // Находим и устанавливаем соответствующую кнопку активной
        const sortButtons = document.querySelectorAll('.sort-btn');
        sortButtons.forEach(btn => {
            btn.classList.toggle('active', 
                btn.dataset.sort === currentSortField && 
                btn.dataset.order === currentSortOrder);
        });
    }
}

// Функция сохранения всех настроек пользователя
function saveAllUserSettings() {
    if (!currentUser) return;
    
    const settings = {
        // Если уже есть настройки, сохраняем их как основу
        ...(currentUser.settings || {}),
        
        // Выбранные монеты
        selected_coins: Array.from(document.querySelectorAll('.coin-tag.active:not(.all-coins-btn)'))
            .map(tag => tag.dataset.coin),
            
        // Выбранные биржи покупки
        selected_buy_exchanges: Array.from(document.querySelectorAll('.buy-exchanges .exchange-tag.active:not(.all-exchanges-btn)'))
            .map(tag => tag.dataset.exchange),
            
        // Выбранные биржи продажи
        selected_sell_exchanges: Array.from(document.querySelectorAll('.sell-exchanges .exchange-tag.active:not(.all-exchanges-btn)'))
            .map(tag => tag.dataset.exchange),
        
        // Режим отображения
        view_mode: currentView,
        
        // Настройки сортировки
        sort_field: currentSortField,
        sort_order: currentSortOrder,
        
        // Интервал обновления (текущее значение)
        update_interval: parseInt(document.querySelector('.interval-btn.active')?.dataset.interval || 10),
        
        // Диапазон спреда
        spread_min: parseFloat(window.DOM.spreadMin.value),
        spread_max: parseFloat(window.DOM.spreadMax.value),
        
        // Диапазон объема
        volume_min: parseInt(window.DOM.volumeMin.value),
        volume_max: parseInt(window.DOM.volumeMax.value),
        
        // Диапазон времени
        time_min: parseInt(window.DOM.timeMin.value),
        time_max: parseInt(window.DOM.timeMax.value)
    };
    
    // Сохраняем настройки на сервере
    api.updateUserSettings(currentUser.telegram_id, settings)
        .then(response => {
            if (response.success) {
                // Обновляем локальную копию настроек
                currentUser.settings = settings;
            }
        })
        .catch(error => {
            console.error('Error saving user settings:', error);
        });
}

// Функция для добавления анимации к кнопке обновления
function animateRefreshButton(duration = 1000) {
    if (!window.DOM.refreshButton) return;
    
    window.DOM.refreshButton.classList.add('rotating');
    
    setTimeout(() => {
        window.DOM.refreshButton.classList.remove('rotating');
    }, duration);
}

// Добавляем CSS анимацию, если её ещё нет
function ensureRefreshButtonStyle() {
    if (!document.getElementById('refresh-btn-style')) {
        const style = document.createElement('style');
        style.id = 'refresh-btn-style';
        style.textContent = `
            @keyframes rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            .refresh-btn.rotating {
                animation: rotate 1s linear infinite;
            }
        `;
        document.head.appendChild(style);
    }
}

// Функция для принудительной проверки ограничений лицензии
function enforceLicenseRestrictions() {
    console.log("Enforcing license restrictions");
    
    const hasFreeAccount = currentUser && 
                          currentUser.license && 
                          currentUser.license.type === "Free";
    
    const hasInactiveLicense = currentUser && 
                              currentUser.license && 
                              !currentUser.license.is_active;
    
    // Ограничиваем доступ для Free аккаунтов и неактивных лицензий
    if (hasFreeAccount || hasInactiveLicense) {
        console.log("Blocking data access:", 
                    hasFreeAccount ? "Free account" : "Inactive license");
        
        // Очищаем данные
        pairsData = [];
        filteredPairsData = [];
        
        // Обновляем интерфейс
        updateStatistics();
        renderHeatmap();
        
        // Показываем уведомление с предложением купить лицензию
        if (hasFreeAccount && !document.querySelector('.license-purchase-notification')) {
            showLicensePurchaseNotification();
        }
    } else {
        // Если лицензия изменилась на платную активную, загружаем данные
        console.log("User has access to data, reloading...");
        fetchData();
    }
}

// Функция для показа уведомления о покупке лицензии
function showLicensePurchaseNotification() {
    const notification = document.createElement('div');
    notification.className = 'license-purchase-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <h3>Приобретите лицензию для доступа ко всем функциям</h3>
            <p>У вас активирована бесплатная лицензия. Для доступа к торговым парам необходимо обновить лицензию.</p>
            <button id="buyLicenseBtn">Приобрести лицензию</button>
            <button id="closeLicenseNotification">Закрыть</button>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Добавляем стили
    const style = document.createElement('style');
    style.textContent = `
        .license-purchase-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 350px;
            background-color: var(--bg-secondary);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow-md);
            border-left: 4px solid var(--accent-blue);
            z-index: 9999;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .notification-content {
            padding: 15px;
        }
        
        .notification-content h3 {
            margin-bottom: 10px;
            color: var(--text-primary);
            font-size: 16px;
        }
        
        .notification-content p {
            margin-bottom: 15px;
            color: var(--text-secondary);
            font-size: 14px;
        }
        
        .notification-content button {
            padding: 8px 12px;
            border-radius: var(--border-radius);
            font-size: 14px;
            cursor: pointer;
            margin-right: 10px;
        }
        
        #buyLicenseBtn {
            background-color: var(--accent-blue);
            color: white;
            border: none;
        }
        
        #closeLicenseNotification {
            background-color: transparent;
            color: var(--text-secondary);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
    `;
    document.head.appendChild(style);
    
    // Добавляем обработчики событий
    document.getElementById('buyLicenseBtn').addEventListener('click', () => {
        window.open('https://t.me/CEXscan_bot', '_blank');
    });
    
    document.getElementById('closeLicenseNotification').addEventListener('click', () => {
        notification.remove();
    });
    
    // Автоматически скрываем уведомление через 15 секунд
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 15000);
}

// Обновленная функция отображения статуса лицензии
function updateLicenseStatus(license) {
    if (!window.DOM.licenseStatus || !license) return;
    
    // Обновляем стиль
    window.DOM.licenseStatus.classList.remove('license-expiring');
    
    if (license.type === "Free") {
        // Для бесплатной лицензии просто показываем "Free"
        window.DOM.licenseStatus.style.backgroundColor = 'rgba(41, 98, 255, 0.1)';
        window.DOM.licenseStatus.style.color = 'var(--accent-blue)';
        window.DOM.licenseStatus.innerHTML = 'Free';
        return;
    }
    
    // Для всех остальных типов лицензий
    let licenseColor = 'rgba(38, 166, 154, 0.1)'; // Зеленый (по умолчанию)
    let textColor = 'var(--accent-green)';
    
    if (!license.is_active) {
        // Неактивная лицензия
        licenseColor = 'rgba(239, 83, 80, 0.1)'; // Красный
        textColor = 'var(--accent-red)';
        window.DOM.licenseStatus.style.backgroundColor = licenseColor;
        window.DOM.licenseStatus.style.color = textColor;
        window.DOM.licenseStatus.innerHTML = 'Неактивна';
        return;
    }
    
    // Активная платная лицензия - показываем только оставшееся время
    window.DOM.licenseStatus.style.backgroundColor = licenseColor;
    window.DOM.licenseStatus.style.color = textColor;
    
    // Получаем оставшееся время
    const timeRemaining = formatTimeRemaining(license.expires_at);
    window.DOM.licenseStatus.innerHTML = timeRemaining;
    
    // Проверяем, осталось ли мало времени
    try {
        let timestamp;
        const expiresAt = license.expires_at;
        
        if (expiresAt.$date) {
            if (typeof expiresAt.$date === 'string') {
                timestamp = new Date(expiresAt.$date).getTime();
            } else if (expiresAt.$date.$numberLong) {
                timestamp = parseInt(expiresAt.$date.$numberLong);
            } else {
                timestamp = expiresAt.$date;
            }
        } else {
            timestamp = expiresAt;
        }
        
        const now = new Date();
        const expires = new Date(timestamp);
        const diff = expires - now;
        
        // Если осталось менее часа, добавляем анимацию мигания
        if (diff < 60 * 60 * 1000 && diff > 0) {
            window.DOM.licenseStatus.classList.add('license-expiring');
            
            // Добавляем стиль анимации, если его еще нет
            if (!document.getElementById('license-animation-style')) {
                const style = document.createElement('style');
                style.id = 'license-animation-style';
                style.textContent = `
                    @keyframes blink {
                        0% { opacity: 1; }
                        50% { opacity: 0.5; }
                        100% { opacity: 1; }
                    }
                    .license-expiring {
                        animation: blink 1s infinite;
                    }
                `;
                document.head.appendChild(style);
            }
        }
    } catch (error) {
        console.error('Error checking license expiry for animation:', error);
    }
}

// Исправленная функция форматирования оставшегося времени
function formatTimeRemaining(expiresAt) {
    if (!expiresAt) return 'не указано';
    
    try {
        // Правильно извлекаем временную метку из MongoDB формата
        let timestamp;
        if (expiresAt.$date) {
            if (typeof expiresAt.$date === 'string') {
                timestamp = new Date(expiresAt.$date).getTime();
            } else if (expiresAt.$date.$numberLong) {
                timestamp = parseInt(expiresAt.$date.$numberLong);
            } else {
                timestamp = expiresAt.$date;
            }
        } else {
            timestamp = expiresAt;
        }
        
        const now = new Date();
        const expires = new Date(timestamp);
        
        if (isNaN(expires.getTime())) {
            console.error('Invalid date:', expiresAt);
            return 'ошибка даты';
        }
        
        const diff = expires - now;

        if (diff <= 0) return 'истекла';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        // Форматируем строку в зависимости от оставшегося времени
        if (days > 0) {
            return `${days}д ${hours}ч`;
        } else if (hours > 0) {
            return `${hours}ч ${minutes}м`;
        } else if (minutes > 0) {
            return `${minutes}м ${seconds}с`;
        } else {
            return `${seconds}с`;
        }
    } catch (error) {
        console.error('Error formatting time:', error, JSON.stringify(expiresAt));
        return 'ошибка';
    }
}

// Загрузка DOM элементов
function setupDOMElements() {
    // Панель фильтров
    window.DOM = {
        // Кнопки переключения видов
        viewButtons: document.querySelectorAll('.view-btn'),
        
        // Кнопки интервала обновления
        intervalButtons: document.querySelectorAll('.interval-btn'),
        
        // Теги монет
        coinTags: document.querySelectorAll('.coin-tag'),
        
        // Теги бирж
        buyExchangeFilters: document.querySelector('.buy-exchanges'),
        sellExchangeFilters: document.querySelector('.sell-exchanges'),
        
        // Кнопка обновления данных
        refreshButton: document.getElementById('refreshData'),
        
        // Поиск монет
        coinSearch: document.getElementById('coinSearch'),
        
        // Контейнеры видов
        treemapView: document.getElementById('treemapView'),
        gridView: document.getElementById('gridView'),
        listView: document.getElementById('listView'),
        
        // Панель деталей
        detailsPanel: document.getElementById('pairDetailsPanel'),
        closeDetailsBtn: document.getElementById('closeDetailsPanel'),
        detailsPinBtn: document.getElementById('detailsPinBtn'),
        
        // Ползунки и их значения
        spreadMin: document.getElementById('spreadMin'),
        spreadMax: document.getElementById('spreadMax'),
        volumeMin: document.getElementById('volumeMin'),
        volumeMax: document.getElementById('volumeMax'),
        timeMin: document.getElementById('timeMin'),
        timeMax: document.getElementById('timeMax'),
        
        spreadMinVal: document.getElementById('spreadMinVal'),
        spreadMaxVal: document.getElementById('spreadMaxVal'),
        volumeMinVal: document.getElementById('volumeMinVal'),
        volumeMaxVal: document.getElementById('volumeMaxVal'),
        timeMinVal: document.getElementById('timeMinVal'),
        timeMaxVal: document.getElementById('timeMaxVal'),
        
        // Статистика
        pairsCount: document.getElementById('pairsCount'),
        maxSpread: document.getElementById('maxSpread'),
        totalVolume: document.getElementById('totalVolume'),
        
        // Пользовательская информация
        username: document.querySelector('.username'),
        licenseStatus: document.querySelector('.license-status'),
        
        // Основной контейнер
        mainContent: document.querySelector('.main-content')
    };
}

// Установка обработчиков событий
function setupEventListeners() {
    // Обработчики кнопок переключения видов
    window.DOM.viewButtons.forEach(button => {
    button.addEventListener('click', function() {
        if (this.classList.contains('disabled')) return;
        
        window.DOM.viewButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        
        currentView = this.dataset.view;
        
        // Сохраняем выбранный режим просмотра в настройках
        saveViewMode(currentView);
        
        // Скрываем все виды и очищаем их стили и содержимое
        document.querySelectorAll('.heatmap-view').forEach(view => {
            view.classList.remove('active');
            // Очищаем содержимое
            view.innerHTML = '';
            // Сбрасываем все inline-стили контейнера
            view.removeAttribute('style');
        });
        
        // Показываем текущий вид
        document.getElementById(currentView + 'View').classList.add('active');
        
        // Обновляем отображение
        renderHeatmap();
    });
});
    
    // Обработчики кнопок сортировки
    setupSortButtons();
    
    // Обработчики кнопок интервала обновления
    window.DOM.intervalButtons.forEach(button => {
        button.addEventListener('click', function() {
            window.DOM.intervalButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            const interval = parseInt(this.dataset.interval);
            startAutoUpdate(interval);
        });
    });
    
    // Обработчик поиска монет
    window.DOM.coinSearch.addEventListener('input', function() {
        const searchText = this.value.toLowerCase();
        
        window.DOM.coinTags.forEach(tag => {
            const coinText = tag.textContent.toLowerCase();
            if (coinText.includes(searchText)) {
                tag.style.display = 'inline-block';
            } else {
                tag.style.display = 'none';
            }
        });
    });
    
    // Обработчик кнопки обновления
    window.DOM.refreshButton.addEventListener('click', function() {
        // Запускаем анимацию (удаление класса произойдет автоматически в fetchData)
        animateRefreshButton(2000);
        fetchData();
    });
    
    // Обработчик закрытия панели деталей
    window.DOM.closeDetailsBtn.addEventListener('click', function() {
        window.DOM.detailsPanel.classList.remove('active');
        isDetailsPanelOpen = false;
        currentDetailsPairId = null;
        
        // Удаляем класс, который показывает, что панель открыта
        window.DOM.mainContent.classList.remove('details-open');
        
        if (detailsPanelTimerId) {
            clearInterval(detailsPanelTimerId);
            detailsPanelTimerId = null;
        }
    });
    
    // Обработчики ползунков диапазонов
    setupRangeListeners();
}

// Настройка кнопок сортировки
function setupSortButtons() {
    const sortButtons = document.querySelectorAll('.sort-btn');
    
    sortButtons.forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.sort-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            currentSortField = this.dataset.sort;
            currentSortOrder = this.dataset.order;
            
            // Сохраняем настройки сортировки
            saveSortSettings(currentSortField, currentSortOrder);
            
            filterAndRenderData();
        });
    });
}
// Проверка доступности режима list и переключение, если нужно
function checkListViewAvailability() {
    const listViewBtn = document.querySelector('.view-btn[data-view="list"]');
    
    if (window.innerWidth <= 840) {
        // Малый экран - блокируем List View
        if (listViewBtn) {
            listViewBtn.classList.add('disabled');
            listViewBtn.setAttribute('disabled', 'disabled');
        }
        
        // Если сейчас активен List View, переключаемся на Grid View
        if (currentView === 'list') {
            const gridViewBtn = document.querySelector('.view-btn[data-view="grid"]');
            if (gridViewBtn) {
                // Переключаем на режим сетки
                window.DOM.viewButtons.forEach(btn => btn.classList.remove('active'));
                gridViewBtn.classList.add('active');
                currentView = 'grid';
                
                // Обновляем интерфейс
                document.querySelectorAll('.heatmap-view').forEach(view => {
                    view.classList.remove('active');
                    view.innerHTML = '';
                    view.removeAttribute('style');
                });
                
                document.getElementById('gridView').classList.add('active');
                renderGrid();
            }
        }
    } else {
        // Большой экран - разблокируем List View
        if (listViewBtn) {
            listViewBtn.classList.remove('disabled');
            listViewBtn.removeAttribute('disabled');
        }
    }
}

// Обработчик изменения размера окна
function handleWindowResize() {
    const currentWidth = window.innerWidth;
    
    // Проверяем, изменилась ли ширина значительно (более 50px)
    if (Math.abs(currentWidth - lastWindowWidth) > 50) {
        lastWindowWidth = currentWidth;
        
        // Обновляем доступность режима list и принудительно переключаем, если нужно
        checkListViewAvailability();
        
        // Если текущий вид - treemap, перерисовываем его
        if (currentView === 'treemap') {
            renderTreemap();
        }
    }
}

// Запуск обновления таймеров для всех элементов
function startTimerUpdates() {
    // Останавливаем предыдущий интервал, если он существует
    if (timerUpdatesInterval) {
        clearInterval(timerUpdatesInterval);
    }
    
    // Обновляем все таймеры каждую секунду
    timerUpdatesInterval = setInterval(() => {
        updateAllTimers();
    }, 1000);
}

// Обновление всех таймеров на странице
function updateAllTimers() {
    // Обновляем таймеры в режиме списка
    const listRows = document.querySelectorAll('#listView tbody tr');
    listRows.forEach(row => {
        const timeCell = row.querySelector('.list-updated');
        if (timeCell && row.dataset.aliveTime) {
            updateElementTimer(timeCell, row.dataset.aliveTime);
        }
    });
    
    // Обновляем таймеры в режиме сетки
    const gridCards = document.querySelectorAll('#gridView .grid-card');
    gridCards.forEach(card => {
        const timeElement = card.querySelector('.card-updated');
        if (timeElement && card.dataset.aliveTime) {
            updateElementTimer(timeElement, card.dataset.aliveTime);
        }
    });
    
    // Обновляем таймеры в режиме тепловой карты
    const treemapTiles = document.querySelectorAll('#treemapView .heatmap-tile');
    treemapTiles.forEach(tile => {
        const timeElement = tile.querySelector('.tile-updated');
        if (timeElement && tile.dataset.aliveTime) {
            updateElementTimer(timeElement, tile.dataset.aliveTime);
        }
    });
    
    // Обновляем таймер в панели деталей, если она открыта
    if (isDetailsPanelOpen) {
        const timerElement = document.getElementById('detailsUpdated');
        const pairData = filteredPairsData.find(p => (p._id.$oid || p._id) === currentDetailsPairId);
        if (timerElement && pairData && pairData.alive_time) {
            const aliveTime = pairData.alive_time.$date || pairData.alive_time;
            updateDetailsPanelTimer(pairData);
        }
    }
}

// Обновление таймера конкретного элемента
function updateElementTimer(element, aliveTimeStr, appendSuffix = false) {
    const now = new Date();
    const aliveTime = new Date(aliveTimeStr);
    const seconds = Math.floor((now - aliveTime) / 1000);
    
    let timerText;
    if (seconds < 60) {
        timerText = `${seconds}с`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        timerText = `${minutes}м`;
    } else if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        timerText = `${hours}ч`;
    } else {
        const days = Math.floor(seconds / 86400);
        timerText = `${days}д`;
    }
    
    if (appendSuffix) {
        timerText += ' назад';
    }
    
    element.textContent = timerText;
}

// Настройка начальных значений ползунков
// Настройка начальных значений ползунков
function setupRangeSliders() {
    // Настраиваем ползунок спреда
    if (window.DOM.spreadMin) {
        // ИСПРАВЛЕНО: Устанавливаем max для минимального ползунка
        window.DOM.spreadMin.max = 100;
        window.DOM.spreadMin.value = 0;
        window.DOM.spreadMinVal.textContent = '0%';
    }
    
    if (window.DOM.spreadMax) {
        window.DOM.spreadMax.max = 100;
        window.DOM.spreadMax.value = 100;
        window.DOM.spreadMaxVal.textContent = '100%';
    }
    
    // Полностью переписываем логику ползунка объема
    if (window.DOM.volumeMax && window.DOM.volumeMin) {
        // Удаляем старые обработчики, если они есть
        if (window.volumeMinHandler) {
            window.DOM.volumeMin.removeEventListener('input', window.volumeMinHandler);
        }
        if (window.volumeMaxHandler) {
            window.DOM.volumeMax.removeEventListener('input', window.volumeMaxHandler);
        }
        
        // Устанавливаем правильные атрибуты
        const MAX_VOLUME = 10000;
        
        window.DOM.volumeMin.max = MAX_VOLUME;
        window.DOM.volumeMax.max = MAX_VOLUME;
        window.DOM.volumeMin.step = 10;
        window.DOM.volumeMax.step = 10;
        window.DOM.volumeMax.value = MAX_VOLUME;
        window.DOM.volumeMaxVal.textContent = formatCurrency(MAX_VOLUME);
        
        // Создаем новые обработчики
        window.volumeMinHandler = function() {
            const minVal = parseInt(this.value);
            const maxVal = parseInt(window.DOM.volumeMax.value);
            
            if(minVal > maxVal) {
                window.DOM.volumeMax.value = minVal;
                window.DOM.volumeMaxVal.textContent = formatCurrency(minVal);
            }
            
            window.DOM.volumeMinVal.textContent = formatCurrency(minVal);
            filterAndRenderData();
        };
        
        window.volumeMaxHandler = function() {
            const maxVal = parseInt(this.value);
            const minVal = parseInt(window.DOM.volumeMin.value);
            
            if(maxVal < minVal) {
                window.DOM.volumeMin.value = maxVal;
                window.DOM.volumeMinVal.textContent = formatCurrency(maxVal);
            }
            
            window.DOM.volumeMaxVal.textContent = formatCurrency(maxVal);
            filterAndRenderData();
        };
        
        // Добавляем новые обработчики
        window.DOM.volumeMin.addEventListener('input', window.volumeMinHandler);
        window.DOM.volumeMax.addEventListener('input', window.volumeMaxHandler);
    }
    
    // Настраиваем ползунок времени
    if (window.DOM.timeMin) {
        // ИСПРАВЛЕНО: Устанавливаем max для минимального ползунка времени
        window.DOM.timeMin.max = 1440; // 24 часа в минутах
        window.DOM.timeMin.value = 0;
        window.DOM.timeMinVal.textContent = '0';
    }
    
    if (window.DOM.timeMax) {
        window.DOM.timeMax.max = 1440; // 24 часа в минутах
        window.DOM.timeMax.value = 1440;
        window.DOM.timeMaxVal.textContent = '1440';
    }
}

// Проверка и исправление ползунка объема
function fixVolumeSlider() {
    if (window.DOM.volumeMax) {
        // Форсируем исправление максимального значения
        window.DOM.volumeMax.setAttribute('max', '10000');
        window.DOM.volumeMax.setAttribute('value', Math.min(window.DOM.volumeMax.value, 10000));
        
        // Обновляем отображаемое значение
        window.DOM.volumeMaxVal.textContent = formatCurrency(parseInt(window.DOM.volumeMax.value));
    }
}

// Настройка обработчиков ползунков
function setupRangeListeners() {
    // Оставляем только обработчики для spreadMin, spreadMax, timeMin, timeMax
    // Обработчики volumeMin и volumeMax теперь в setupRangeSliders
    
    // Ползунок минимального спреда
    window.DOM.spreadMin.addEventListener('input', function() {
        const minVal = parseFloat(this.value);
        const maxVal = parseFloat(window.DOM.spreadMax.value);
        
        if(minVal > maxVal) {
            window.DOM.spreadMax.value = minVal;
        }
        
        window.DOM.spreadMinVal.textContent = minVal.toFixed(1) + '%';
        filterAndRenderData();
    });
    
    // Ползунок максимального спреда
    window.DOM.spreadMax.addEventListener('input', function() {
        const maxVal = parseFloat(this.value);
        const minVal = parseFloat(window.DOM.spreadMin.value);
        
        if(maxVal < minVal) {
            window.DOM.spreadMin.value = maxVal;
        }
        
        window.DOM.spreadMaxVal.textContent = maxVal.toFixed(1) + '%';
        filterAndRenderData();
    });
    
    // Ползунок минимального времени
    window.DOM.timeMin.addEventListener('input', function() {
        const minVal = parseFloat(this.value);
        const maxVal = parseFloat(window.DOM.timeMax.value);
        
        if(minVal > maxVal) {
            window.DOM.timeMax.value = minVal;
        }
        
        window.DOM.timeMinVal.textContent = minVal;
        filterAndRenderData();
    });
    
    // Ползунок максимального времени
    window.DOM.timeMax.addEventListener('input', function() {
        const maxVal = parseFloat(this.value);
        const minVal = parseFloat(window.DOM.timeMin.value);
        
        if(maxVal < minVal) {
            window.DOM.timeMin.value = maxVal;
        }
        
        window.DOM.timeMaxVal.textContent = maxVal;
        filterAndRenderData();
    });
}

// Замена блока группировки на блок сортировки
function replaceSortingControls() {
    const groupingBlock = document.querySelector('.filter-group:nth-child(2)');
    if (!groupingBlock) return;
    
    groupingBlock.innerHTML = `
        <h3>Сортировка</h3>
        <div class="sort-options">
            <button class="sort-btn" data-sort="coin" data-order="asc">
                <span class="material-icons-round">sort_by_alpha</span>
                <span>По монете ↑</span>
            </button>
            <button class="sort-btn" data-sort="coin" data-order="desc">
                <span class="material-icons-round">sort_by_alpha</span>
                <span>По монете ↓</span>
            </button>
            <button class="sort-btn" data-sort="network" data-order="asc">
                <span class="material-icons-round">lan</span>
                <span>По сети ↑</span>
            </button>
            <button class="sort-btn" data-sort="network" data-order="desc">
                <span class="material-icons-round">lan</span>
                <span>По сети ↓</span>
            </button>
            <button class="sort-btn active" data-sort="spread" data-order="desc">
                <span class="material-icons-round">trending_up</span>
                <span>По спреду ↓</span>
            </button>
            <button class="sort-btn" data-sort="spread" data-order="asc">
                <span class="material-icons-round">trending_down</span>
                <span>По спреду ↑</span>
            </button>
            <button class="sort-btn" data-sort="profit" data-order="desc">
                <span class="material-icons-round">payments</span>
                <span>По прибыли ↓</span>
            </button>
            <button class="sort-btn" data-sort="profit" data-order="asc">
                <span class="material-icons-round">payments</span>
                <span>По прибыли ↑</span>
            </button>
        </div>
    `;
}

// Настройка сворачиваемых блоков фильтров
function setupCollapsibleFilterGroups() {
    const filterGroups = document.querySelectorAll('.filter-panel .filter-group');
    
    filterGroups.forEach(group => {
        // Находим заголовок группы
        const heading = group.querySelector('h3');
        if (!heading) return;
        
        // Создаем новый заголовок с кнопкой
        const headingContainer = document.createElement('div');
        headingContainer.className = 'filter-heading';
        
        // Клонируем текущий заголовок
        const headingText = document.createElement('h3');
        headingText.textContent = heading.textContent;
        
        // Создаем кнопку
        const collapseBtn = document.createElement('span');
        collapseBtn.className = 'material-icons-round collapse-btn';
        collapseBtn.textContent = 'expand_less';
        
        // Собираем новый заголовок
        headingContainer.appendChild(headingText);
        headingContainer.appendChild(collapseBtn);
        
        // Заменяем старый заголовок на новый с кнопкой
        heading.parentNode.replaceChild(headingContainer, heading);
        
        // Оборачиваем все содержимое после заголовка
        const content = document.createElement('div');
        content.className = 'filter-group-content';
        
        // Перемещаем все элементы после заголовка в новый контейнер
        while (group.children[1]) {
            content.appendChild(group.children[1]);
        }
        
        group.appendChild(content);
        
        // Добавляем обработчик клика
        headingContainer.addEventListener('click', function() {
            group.classList.toggle('collapsed');
            
            if (group.classList.contains('collapsed')) {
                collapseBtn.textContent = 'expand_more';
            } else {
                collapseBtn.textContent = 'expand_less';
            }
        });
    });
}

// Настройка мобильных контролей
function setupMobileFilterToggle() {
    // Создаем кнопку переключения фильтров
    const filterToggleBtn = document.createElement('button');
    filterToggleBtn.className = 'filter-toggle-btn';
    filterToggleBtn.innerHTML = '<span class="material-icons-round">filter_list</span>';
    document.body.appendChild(filterToggleBtn);
    
    // Создаем оверлей для фона
    const filterOverlay = document.createElement('div');
    filterOverlay.className = 'filter-overlay';
    document.body.appendChild(filterOverlay);
    
    // Обработчик клика на кнопку
    filterToggleBtn.addEventListener('click', function() {
        const filterPanel = document.querySelector('.filter-panel');
        filterPanel.classList.toggle('active');
        filterOverlay.classList.toggle('active');
    });
    
    // Закрытие панели при клике на оверлей
    filterOverlay.addEventListener('click', function() {
        const filterPanel = document.querySelector('.filter-panel');
        filterPanel.classList.remove('active');
        filterOverlay.classList.remove('active');
    });
}

// Улучшение представления списка
function enhanceListView() {
    const listView = document.getElementById('listView');
    if (!listView) return;
    
    // Оборачиваем таблицу в контейнер для горизонтальной прокрутки
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'table-scroll-container';
    
    // Если в listView уже есть таблица, переместим её в контейнер
    const existingTable = listView.querySelector('.list-table');
    if (existingTable) {
        listView.innerHTML = '';
        scrollContainer.appendChild(existingTable);
        listView.appendChild(scrollContainer);
    } else {
        // Изменим функцию renderList, чтобы она добавляла таблицу в контейнер
        listView.appendChild(scrollContainer);
    }
}

// Загрузка бирж и монет
async function loadExchangesAndCoins() {
    try {
        // Загружаем биржи и монеты параллельно
        const [exchanges, coins] = await Promise.all([
            api.getExchanges(),
            api.getCoins()
        ]);
        
        // Сохраняем биржи в глобальные переменные
        if (exchanges && Array.isArray(exchanges)) {
            buyExchanges = exchanges.filter(ex => ex.is_active);
            sellExchanges = exchanges.filter(ex => ex.is_active);
        }
        
        // Рендерим теги монет
        renderCoinTags(coins);
        
        // Рендерим теги бирж
        renderExchangeTags(buyExchanges, 'buy');
        renderExchangeTags(sellExchanges, 'sell');
        
        return { exchanges, coins };
    } catch (error) {
        console.error('Error loading exchanges and coins:', error);
        showNotification('Ошибка загрузки данных бирж и монет', 'error');
        return { exchanges: [], coins: [] };
    }
}

// Рендеринг тегов монет
function renderCoinTags(coins) {
    const container = document.querySelector('.coin-filters');
    
    // Очищаем контейнер
    container.innerHTML = '';
    
    // Добавляем кнопку "Все монеты" в начало
    const allCoinsTag = document.createElement('div');
    allCoinsTag.className = 'coin-tag all-coins-btn';
    allCoinsTag.textContent = 'Все монеты';
    
    // Определяем текущее состояние - выбраны ли все монеты
    let allSelected = false;
    if (currentUser && currentUser.settings && 
        currentUser.settings.selected_coins) {
        allSelected = currentUser.settings.selected_coins.length === coins.length;
    }
    
    if (allSelected) {
        allCoinsTag.classList.add('active');
    }
    
    // Добавляем обработчик клика для кнопки "Все монеты"
    allCoinsTag.addEventListener('click', function() {
        const isActive = this.classList.contains('active');
        
        // Обновляем состояние всех монет
        const coinTags = document.querySelectorAll('.coin-tag:not(.all-coins-btn)');
        coinTags.forEach(tag => {
            tag.classList.toggle('active', !isActive);
        });
        
        // Обновляем состояние кнопки
        this.classList.toggle('active');
        
        // Применяем фильтры
        filterAndRenderData();
        
        // Сохраняем выбор пользователя
        saveUserFilters();
    });
    
    container.appendChild(allCoinsTag);
    
    // Добавляем теги для каждой монеты
    coins.forEach(coin => {
        const tag = document.createElement('div');
        tag.className = 'coin-tag';
        tag.dataset.coin = coin.symbol;
        tag.textContent = coin.symbol;
        
        // Если монета ранее была выбрана или выбраны все, отмечаем её
        if (currentUser && currentUser.settings && 
            currentUser.settings.selected_coins && 
            currentUser.settings.selected_coins.includes(coin.symbol)) {
            tag.classList.add('active');
        }
        
        // Добавляем обработчик клика
        tag.addEventListener('click', function() {
            this.classList.toggle('active');
            
            // Проверяем, все ли монеты выбраны
            const allCoinsBtn = document.querySelector('.all-coins-btn');
            const allSelected = 
                document.querySelectorAll('.coin-tag:not(.all-coins-btn)').length === 
                document.querySelectorAll('.coin-tag.active:not(.all-coins-btn)').length;
            
            // Обновляем состояние кнопки "Все монеты"
            if (allCoinsBtn) {
                allCoinsBtn.classList.toggle('active', allSelected);
            }
            
            filterAndRenderData();
            
            // Сохраняем выбор пользователя
            saveUserFilters();
        });
        
        container.appendChild(tag);
    });
    
    // Обновляем DOM ссылку на теги
    window.DOM.coinTags = document.querySelectorAll('.coin-tag');
    
    // Добавляем CSS стили для кнопки "Все монеты"
    const style = document.createElement('style');
    style.textContent = `
        .all-coins-btn {
            background-color: var(--bg-secondary);
            font-weight: 600;
            border-color: var(--accent-blue);
        }
        
        .all-coins-btn.active {
            background-color: rgba(41, 98, 255, 0.3);
        }
    `;
    document.head.appendChild(style);
}

// Рендеринг тегов бирж
function renderExchangeTags(exchanges, type) {
    // Определяем контейнер в зависимости от типа
    const container = type === 'buy' ? window.DOM.buyExchangeFilters : window.DOM.sellExchangeFilters;
    
    // Очищаем контейнер
    container.innerHTML = '';
    
    // Добавляем кнопку "Все биржи" в начало
    const allExchangesTag = document.createElement('div');
    allExchangesTag.className = 'exchange-tag all-exchanges-btn';
    allExchangesTag.dataset.type = type;
    allExchangesTag.textContent = 'Все биржи';
    
    // Определяем текущее состояние - выбраны ли все биржи
    let allSelected = true;
    if (currentUser && currentUser.settings) {
        const settingKey = type === 'buy' ? 'selected_buy_exchanges' : 'selected_sell_exchanges';
        if (currentUser.settings[settingKey] && Array.isArray(currentUser.settings[settingKey])) {
            allSelected = currentUser.settings[settingKey].length === exchanges.length;
        }
    }
    
    if (allSelected) {
        allExchangesTag.classList.add('active');
    }
    
    // Добавляем обработчик клика для кнопки "Все биржи"
    allExchangesTag.addEventListener('click', function() {
        const isActive = this.classList.contains('active');
        
        // Обновляем состояние всех бирж
        const exchangeTags = container.querySelectorAll('.exchange-tag:not(.all-exchanges-btn)');
        exchangeTags.forEach(tag => {
            tag.classList.toggle('active', !isActive);
        });
        
        // Обновляем состояние кнопки
        this.classList.toggle('active');
        
        // Применяем фильтры
        filterAndRenderData();
        
        // Сохраняем выбор пользователя
        saveUserFilters();
    });
    
    container.appendChild(allExchangesTag);
    
    // Добавляем теги для каждой биржи
    exchanges.forEach(exchange => {
        const tag = document.createElement('div');
        tag.className = 'exchange-tag';
        tag.dataset.exchange = exchange.symbol;
        tag.dataset.type = type;
        tag.textContent = exchange.name;
        
        // Если биржа ранее была выбрана или выбраны все, отмечаем её
        const settingKey = type === 'buy' ? 'selected_buy_exchanges' : 'selected_sell_exchanges';
        if (currentUser && currentUser.settings && 
            currentUser.settings[settingKey] && 
            currentUser.settings[settingKey].includes(exchange.symbol)) {
            tag.classList.add('active');
        } else if (allSelected) {
            tag.classList.add('active');
        }
        
        // Добавляем обработчик клика
        tag.addEventListener('click', function() {
            this.classList.toggle('active');
            
            // Проверяем, все ли биржи выбраны
            const allExchangesBtn = container.querySelector('.all-exchanges-btn');
            const allSelected = 
                container.querySelectorAll('.exchange-tag:not(.all-exchanges-btn)').length === 
                container.querySelectorAll('.exchange-tag.active:not(.all-exchanges-btn)').length;
            
            // Обновляем состояние кнопки "Все биржи"
            if (allExchangesBtn) {
                allExchangesBtn.classList.toggle('active', allSelected);
            }
            
            filterAndRenderData();
            
            // Сохраняем выбор пользователя
            saveUserFilters();
        });
        
        container.appendChild(tag);
    });
}

// Автоматическое обновление данных
function startAutoUpdate(seconds) {
    // Очищаем предыдущий интервал, если он существует
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    
    // Устанавливаем новый интервал, если задано положительное значение
    if (seconds > 0) {
        updateInterval = setInterval(() => {
            // Запускаем анимацию кнопки при каждом автоматическом обновлении
            animateRefreshButton(1000);
            fetchData();
        }, seconds * 1000);
        
        // Сохраняем настройку
        saveUpdateInterval(seconds);
    }
}

// Сохранение интервала обновления
function saveUpdateInterval(seconds) {
    if (!currentUser) return;
    
    const updatedSettings = {
        ...(currentUser.settings || {}),
        update_interval: seconds
    };
    
    api.updateUserSettings(currentUser.telegram_id, updatedSettings)
        .then(response => {
            if (response.success) {
                // Обновляем локальную копию настроек
                currentUser.settings = updatedSettings;
            }
        })
        .catch(error => {
            console.error('Error updating interval:', error);
        });
}

// Функция добавляет слушатели на изменение настроек для их сохранения
function setupSettingsSaveListeners() {
    // Слушатель изменения вида отображения
    window.DOM.viewButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (this.classList.contains('disabled')) return;
            const mode = this.dataset.view;
            saveViewMode(mode);
        });
    });
    
    // Слушатель изменения сортировки
    document.querySelectorAll('.sort-btn').forEach(button => {
        button.addEventListener('click', function() {
            const field = this.dataset.sort;
            const order = this.dataset.order;
            saveSortSettings(field, order);
        });
    });
    
    // Слушатели изменения диапазонов (debounced для снижения нагрузки)
    const debouncedSaveFilters = debounce(saveUserFilters, 500);
    
    window.DOM.spreadMin.addEventListener('change', debouncedSaveFilters);
    window.DOM.spreadMax.addEventListener('change', debouncedSaveFilters);
    window.DOM.volumeMin.addEventListener('change', debouncedSaveFilters);
    window.DOM.volumeMax.addEventListener('change', debouncedSaveFilters);
    window.DOM.timeMin.addEventListener('change', debouncedSaveFilters);
    window.DOM.timeMax.addEventListener('change', debouncedSaveFilters);
    
    // Сохранение настроек при закрытии или перезагрузке страницы
    window.addEventListener('beforeunload', saveAllUserSettings);
}

// Вспомогательная функция debounce для снижения количества запросов
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Сохранение настроек сортировки
function saveSortSettings(field, order) {
    if (!currentUser) return;
    
    const updatedSettings = {
        ...(currentUser.settings || {}),
        sort_field: field,
        sort_order: order
    };
    
    api.updateUserSettings(currentUser.telegram_id, updatedSettings)
        .then(response => {
            if (response.success) {
                // Обновляем локальную копию настроек
                currentUser.settings = updatedSettings;
            }
        })
        .catch(error => {
            console.error('Error updating sort settings:', error);
        });
}

function hasAccessToTradingPairs() {
    if (!currentUser || !currentUser.license) return false;
    
    const license = currentUser.license;
    
    // Если тип Free, доступа нет
    if (license.type === "Free") {
        return false;
    }
    
    // Если не Free, но лицензия не активна, тоже нет доступа
    if (!license.is_active) {
        return false;
    }
    
    // В остальных случаях доступ разрешен
    return true;
}
// Сохранение режима просмотра
function saveViewMode(mode) {
    if (!currentUser) return;
    
    const updatedSettings = {
        ...(currentUser.settings || {}),
        view_mode: mode
    };
    
    api.updateUserSettings(currentUser.telegram_id, updatedSettings)
        .then(response => {
            if (response.success) {
                // Обновляем локальную копию настроек
                currentUser.settings = updatedSettings;
            }
        })
        .catch(error => {
            console.error('Error updating view mode:', error);
        });
}

function saveUserFilters() {
    if (!currentUser) return;
    
    // Получаем текущие активные монеты
    const activeCoins = Array.from(document.querySelectorAll('.coin-tag.active:not(.all-coins-btn)'))
        .map(tag => tag.dataset.coin);
    
    // Получаем текущие активные биржи покупки
    const activeBuyExchanges = Array.from(document.querySelectorAll('.buy-exchanges .exchange-tag.active:not(.all-exchanges-btn)'))
        .map(tag => tag.dataset.exchange);
    
    // Получаем текущие активные биржи продажи
    const activeSellExchanges = Array.from(document.querySelectorAll('.sell-exchanges .exchange-tag.active:not(.all-exchanges-btn)'))
        .map(tag => tag.dataset.exchange);
    
    // Создаем объект с обновленными фильтрами
    const updatedSettings = {
        ...(currentUser.settings || {}),
        selected_coins: activeCoins,
        selected_buy_exchanges: activeBuyExchanges,
        selected_sell_exchanges: activeSellExchanges,
        
        // Добавляем текущие значения диапазонов
        spread_min: parseFloat(window.DOM.spreadMin.value),
        spread_max: parseFloat(window.DOM.spreadMax.value),
        volume_min: parseInt(window.DOM.volumeMin.value),
        volume_max: parseInt(window.DOM.volumeMax.value),
        time_min: parseInt(window.DOM.timeMin.value),
        time_max: parseInt(window.DOM.timeMax.value)
    };
    
    // Сохраняем обновленные настройки
    api.updateUserSettings(currentUser.telegram_id, updatedSettings)
        .then(response => {
            if (response.success) {
                // Обновляем локальную копию настроек
                currentUser.settings = updatedSettings;
            }
        })
        .catch(error => {
            console.error('Error updating user filters:', error);
        });
}

// Получение данных с API
async function fetchData() {
    try {
        // Показываем индикатор загрузки
        window.DOM.refreshButton.classList.add('rotating');
        
        // Проверяем доступ на основе лицензии
        if (!hasAccessToTradingPairs()) {
            console.log("No access to trading pairs due to license restrictions");
            
            // Очищаем существующие данные
            pairsData = [];
            filteredPairsData = [];
            
            // Обновляем отображение с пустыми данными
            updateStatistics();
            renderHeatmap(); 
            return;
        }
        
        // Получаем данные пар
        const userId = currentUser?.telegram_id;
        if (!userId) {
            throw new Error('User not authenticated');
        }
        
        const pairsResponse = await api.getPairs(userId);
        
        if (pairsResponse.active_pairs) {
            // Обрабатываем пары и отмечаем закрепленные
            pairsData = pairsResponse.active_pairs.map(pair => {
                // Проверяем, является ли пара закрепленной
                const isPinned = pairsResponse.pinned_pairs 
                    ? pairsResponse.pinned_pairs.some(p => 
                        (p.pair_id.$oid || p.pair_id) === (pair._id.$oid || pair._id))
                    : false;
                
                return {
                    ...pair,
                    is_pinned: isPinned
                };
            });
            
            // Фильтруем и отображаем данные
            filterAndRenderData();
            
            // Если открыта панель деталей, обновляем информацию в ней
            if (isDetailsPanelOpen && currentDetailsPairId) {
                const pair = pairsData.find(p => 
                    (p._id.$oid || p._id) === currentDetailsPairId);
                
                if (pair) {
                    showPairDetails(pair);
                }
            }
        } else {
            showNotification('Нет активных пар', 'warning');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        showNotification('Ошибка загрузки данных', 'error');
        
        // Если ошибка связана с аутентификацией, перенаправляем на вход
        if (error.message === 'User not authenticated') {
            redirectToLogin();
        }
    } finally {
        // Убираем индикатор загрузки
        setTimeout(() => {
            window.DOM.refreshButton.classList.remove('rotating');
        }, 500);
    }
}

// Модификация функций рендеринга для отображения сообщения о покупке лицензии
function renderPurchaseLicenseMessage(container) {
    container.innerHTML = '';
    
    // Проверка на ограничение доступа
    const hasFreeAccount = currentUser && 
                          currentUser.license && 
                          currentUser.license.type === "Free";
    
    const hasInactiveLicense = currentUser && 
                              currentUser.license && 
                              !currentUser.license.is_active;
    
    // Показываем сообщение только для Free аккаунтов или неактивных лицензий
    if (!hasFreeAccount && !hasInactiveLicense) {
        return false;
    }
    
    // Создаем контейнер для сообщения
    const messageContainer = document.createElement('div');
    messageContainer.className = 'license-required-message';
    
    // Разные сообщения для Free и неактивной лицензии
    let message;
    
    if (hasFreeAccount) {
        message = `
            <div class="license-message-content">
                <h2>Для доступа к торговым парам необходима лицензия</h2>
                <p>У вас установлена бесплатная лицензия (Free), которая не предоставляет доступ к торговым парам.</p>
                <p>Для получения полного доступа приобретите лицензию в Telegram боте.</p>
                <button id="purchaseLicenseBtn" class="purchase-btn">Приобрести лицензию</button>
            </div>
        `;
    } else {
        message = `
            <div class="license-message-content">
                <h2>Ваша лицензия неактивна</h2>
                <p>Для восстановления доступа к торговым парам, пожалуйста, продлите вашу лицензию.</p>
                <button id="purchaseLicenseBtn" class="purchase-btn">Продлить лицензию</button>
            </div>
        `;
    }
    
    messageContainer.innerHTML = message;
    container.appendChild(messageContainer);
    
    // Добавляем стили, если их ещё нет
    if (!document.getElementById('license-required-styles')) {
        const style = document.createElement('style');
        style.id = 'license-required-styles';
        style.textContent = `
            .license-required-message {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100%;
                width: 100%;
                padding: 20px;
                text-align: center;
            }
            
            .license-message-content {
                background-color: var(--bg-secondary);
                border-radius: var(--border-radius);
                padding: 30px;
                max-width: 500px;
                box-shadow: var(--shadow-md);
            }
            
            .license-message-content h2 {
                color: var(--text-primary);
                margin-bottom: 20px;
            }
            
            .license-message-content p {
                color: var(--text-secondary);
                margin-bottom: 15px;
            }
            
            .purchase-btn {
                background-color: var(--accent-blue);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: var(--border-radius);
                cursor: pointer;
                font-weight: 500;
                margin-top: 10px;
                transition: background-color 0.2s;
            }
            
            .purchase-btn:hover {
                background-color: #1756ff;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Добавляем обработчик для кнопки покупки лицензии
    const purchaseBtn = document.getElementById('purchaseLicenseBtn');
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', function() {
            // Открываем ссылку на бота
            window.open('https://t.me/CEXscan_bot', '_blank');
        });
    }
    
    return true; // Сообщение показано
}

// Фильтрация данных и обновление отображения
function filterAndRenderData() {
    // Получаем значения фильтров
    const minSpread = parseFloat(window.DOM.spreadMin.value);
    const maxSpread = parseFloat(window.DOM.spreadMax.value);
    const minVolume = parseFloat(window.DOM.volumeMin.value);
    const maxVolume = parseFloat(window.DOM.volumeMax.value);
    const minTime = parseFloat(window.DOM.timeMin.value) * 60; // в секундах
    const maxTime = parseFloat(window.DOM.timeMax.value) * 60; // в секундах
    
    // Получаем активные монеты
    const activeCoins = Array.from(document.querySelectorAll('.coin-tag.active:not(.all-coins-btn)'))
        .map(tag => tag.dataset.coin);
    
    // Фильтруем данные
    filteredPairsData = pairsData.filter(pair => {
        // Проверка спреда
        if (pair.spread < minSpread || pair.spread > maxSpread) return false;
        
        // Проверка объема
        if (pair.available_volume_usd < minVolume || pair.available_volume_usd > maxVolume) return false;
        
        // Проверка времени обновления
        if (pair.alive_time) {
            const now = new Date();
            const aliveTime = new Date(pair.alive_time.$date || pair.alive_time);
            const seconds = Math.floor((now - aliveTime) / 1000);
            
            if (seconds < minTime || seconds > maxTime) return false;
        }
        
        // Проверка монеты
        if (activeCoins.length > 0) {
            const pairCoin = pair.coin_pair.split('/')[0];
            if (!activeCoins.includes(pairCoin)) return false;
        }
        
        // Проверка биржи покупки
        const activeBuyExchanges = Array.from(document.querySelectorAll('.buy-exchanges .exchange-tag.active:not(.all-exchanges-btn)'))
            .map(tag => tag.dataset.exchange);
        if (activeBuyExchanges.length > 0) {
            if (!activeBuyExchanges.includes(pair.buy_exchange)) return false;
        }
        
        // Проверка биржи продажи
        const activeSellExchanges = Array.from(document.querySelectorAll('.sell-exchanges .exchange-tag.active:not(.all-exchanges-btn)'))
            .map(tag => tag.dataset.exchange);
        if (activeSellExchanges.length > 0) {
            if (!activeSellExchanges.includes(pair.sell_exchange)) return false;
        }
        
        return true;
    });
    
    // Сортируем данные
    filteredPairsData = sortData(filteredPairsData, currentSortField, currentSortOrder);
    
    // Обновляем статистику и отображение
    updateStatistics();
    renderHeatmap();
}

// Функция сортировки данных
function sortData(data, field, order) {
    return [...data].sort((a, b) => {
        let valueA, valueB;
        
        switch (field) {
            case 'coin':
                valueA = a.coin_pair.split('/')[0];
                valueB = b.coin_pair.split('/')[0];
                break;
            case 'network':
                valueA = a.network;
                valueB = b.network;
                break;
            case 'spread':
                valueA = a.spread;
                valueB = b.spread;
                break;
            case 'profit':
                valueA = a.available_volume_usd * a.spread / 100;
                valueB = b.available_volume_usd * b.spread / 100;
                break;
            default:
                valueA = a.spread;
                valueB = b.spread;
        }
        
        // Для строковых полей используем localeCompare
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            return order === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
        }
        
        // Для числовых полей используем обычное сравнение
        return order === 'asc' ? valueA - valueB : valueB - valueA;
    });
}

// Обновление статистических данных
function updateStatistics() {
    if (!window.DOM.pairsCount || !window.DOM.maxSpread || !window.DOM.totalVolume) return;
    
    // Количество пар
    window.DOM.pairsCount.textContent = filteredPairsData.length;
    
    // Максимальный спред
    const maxSpread = filteredPairsData.length > 0 ? 
        Math.max(...filteredPairsData.map(p => p.spread)) : 0;
    window.DOM.maxSpread.textContent = formatPercent(maxSpread);
    
    // Общий объем
    const totalVolume = filteredPairsData.reduce((sum, p) => sum + (p.available_volume_usd || 0), 0);
    window.DOM.totalVolume.textContent = formatCurrency(totalVolume);
}

// Рендеринг тепловой карты в соответствии с выбранным видом
function renderHeatmap() {
    switch (currentView) {
        case 'treemap':
            renderTreemap();
            break;
        case 'grid':
            renderGrid();
            break;
        case 'list':
            renderList();
            break;
    }
}

// Рендеринг в виде TreeMap
function renderTreemap() {
    const container = window.DOM.treemapView;
    container.innerHTML = '';
    
    // Проверяем доступ на основе лицензии
    if (!hasAccessToTradingPairs()) {
        renderPurchaseLicenseMessage(container);
        return;
    }
    
    if (filteredPairsData.length === 0) {
        container.innerHTML = '<div class="no-data">Нет данных, соответствующих фильтрам</div>';
        return;
    }
    
    // Настройка стиля контейнера для плотного размещения
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    container.style.gridAutoRows = 'minmax(100px, auto)';
    container.style.gap = '1px';
    container.style.gridAutoFlow = 'dense';
    container.style.backgroundColor = 'var(--bg-secondary)';
    
    // Создаем тайлы
    filteredPairsData.forEach((pair, index) => {
        const heatClass = getHeatClass(pair.spread);
        
        // Определяем размер тайла (важные пары больше)
        let tileSize = 1;
        
        // Если пара в топ-5 по объему или спреду, делаем её крупнее
        if (index < 5) {
            tileSize = 2;
        }
        
        const tile = document.createElement('div');
        tile.className = `heatmap-tile ${heatClass}`;
        
        // Задаем размер через grid-span
        if (tileSize > 1) {
            tile.style.gridColumn = `span ${tileSize}`;
            tile.style.gridRow = `span ${tileSize}`;
        }
        
        // Убираем скругление и отступы
        tile.style.borderRadius = '0';
        tile.style.margin = '0';
        
        // Сохраняем время обновления для таймера
        if (pair.alive_time) {
            tile.dataset.aliveTime = pair.alive_time.$date || pair.alive_time;
        }
        
        // Добавляем класс для закрепленных пар
        if (pair.is_pinned) {
            tile.classList.add('pinned');
        }
        
        // Содержимое тайла
        tile.innerHTML = `
            <div class="tile-content">
                <div class="tile-header">
                    <div class="tile-pair">${pair.coin_pair}</div>
                    <div class="tile-spread">+${formatPercent(pair.spread)}</div>
                </div>
                <div class="tile-body">
                    <div class="tile-exchanges">
                        <span class="exchange-link" data-url="${pair.buy_url || '#'}">${pair.buy_exchange}</span> → 
                        <span class="exchange-link" data-url="${pair.sell_url || '#'}">${pair.sell_exchange}</span>
                    </div>
                </div>
                <div class="tile-footer">
                    <div class="tile-volume">$${formatNumber(pair.available_volume_usd)}</div>
                    <div class="tile-updated"></div>
                </div>
            </div>
        `;
        
        // Обновляем время для тайла
        const timeElement = tile.querySelector('.tile-updated');
        if (timeElement && pair.alive_time) {
            updateElementTimer(timeElement, pair.alive_time.$date || pair.alive_time);
        }
        
        // Обработчик клика для показа деталей
        tile.addEventListener('click', (e) => {
            // Проверяем, не клик ли это по ссылке биржи
            if (!e.target.classList.contains('exchange-link')) {
                showPairDetails(pair);
            }
        });
        
        // Добавляем обработчики для ссылок бирж
        const exchangeLinks = tile.querySelectorAll('.exchange-link');
        exchangeLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем клик по карточке
                const url = link.dataset.url;
                if (url && url !== '#') {
                    window.open(url, '_blank');
                }
            });
        });
        
        container.appendChild(tile);
    });
}

// Рендеринг в виде сетки карточек
function renderGrid() {
    const container = window.DOM.gridView;
    container.innerHTML = '';
    
    // Проверяем доступ на основе лицензии
    if (!hasAccessToTradingPairs()) {
        renderPurchaseLicenseMessage(container);
        return;
    }
    
    if (filteredPairsData.length === 0) {
        container.innerHTML = '<div class="no-data">Нет данных, соответствующих фильтрам</div>';
        return;
    }
    
    // Создаем контейнер для карточек
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'grid-cards';
    
    // Создаем карточки для каждой пары
    filteredPairsData.forEach(pair => {
        const heatClass = getHeatClass(pair.spread);
        
        const card = document.createElement('div');
        card.className = `grid-card ${heatClass}`;
        
        // Сохраняем время обновления для таймера
        if (pair.alive_time) {
            card.dataset.aliveTime = pair.alive_time.$date || pair.alive_time;
        }
        
        // Если пара закреплена, добавляем класс
        if (pair.is_pinned) {
            card.classList.add('pinned');
        }
        
        // Содержимое карточки
        card.innerHTML = `
            <div class="card-content">
                <div class="card-header">
                    <div>
                        <div class="card-pair">${pair.coin_pair}</div>
                        <div class="card-network">${pair.network}</div>
                    </div>
                    <div class="card-spread">+${formatPercent(pair.spread)}</div>
                </div>
                <div class="card-exchanges">
                    <div class="card-buy">
                        <div class="exchange-label">Покупка</div>
                        <div class="exchange-name exchange-link" data-url="${pair.buy_url || '#'}">${pair.buy_exchange}</div>
                        <div class="exchange-price">$${formatPrice(pair.buy_price)}</div>
                    </div>
                    <div class="card-sell">
                        <div class="exchange-label">Продажа</div>
                        <div class="exchange-name exchange-link" data-url="${pair.sell_url || '#'}">${pair.sell_exchange}</div>
                        <div class="exchange-price">$${formatPrice(pair.sell_price)}</div>
                    </div>
                </div>
                <div class="card-footer">
                    <div>Объем: $${formatNumber(pair.available_volume_usd)}</div>
                    <div>Прибыль: $${formatNumber(pair.available_volume_usd * pair.spread / 100)}</div>
                    <div class="card-updated"></div>
                </div>
            </div>
        `;
        
        // Обновляем время для карточки
        const timeElement = card.querySelector('.card-updated');
        if (timeElement && pair.alive_time) {
            updateElementTimer(timeElement, pair.alive_time.$date || pair.alive_time);
        }
        
        // Обработчик клика для карточки (показ деталей)
        card.addEventListener('click', (e) => {
            // Проверяем, не клик ли это по ссылке биржи
            if (!e.target.classList.contains('exchange-link')) {
                showPairDetails(pair);
            }
        });
        
        // Добавляем обработчики для ссылок бирж
        const exchangeLinks = card.querySelectorAll('.exchange-link');
        exchangeLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем клик по карточке
                const url = link.dataset.url;
                if (url && url !== '#') {
                    window.open(url, '_blank');
                }
            });
        });
        
        cardsContainer.appendChild(card);
    });
    
    container.appendChild(cardsContainer);
}

// Рендеринг в виде таблицы
function renderList() {
    const container = window.DOM.listView;
    container.innerHTML = '';
    
    // Проверяем доступ на основе лицензии
    if (!hasAccessToTradingPairs()) {
        renderPurchaseLicenseMessage(container);
        return;
    }
    
    if (filteredPairsData.length === 0) {
        container.innerHTML = '<div class="no-data">Нет данных, соответствующих фильтрам</div>';
        return;
    }
    
    // Создаем контейнер для горизонтальной прокрутки
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'table-scroll-container';
    
    // Создаем таблицу
    const table = document.createElement('table');
    table.className = 'list-table';
    
    // Заголовок таблицы
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Создаем заголовки колонок явно
    const headers = ['Пара', 'Сеть', 'Спред', 'Покупка', 'Продажа', 'Объем', 'Прибыль', 'Обновлено'];
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Тело таблицы
    const tbody = document.createElement('tbody');
    
    filteredPairsData.forEach(pair => {
        const heatClass = getHeatClass(pair.spread);
        
        const row = document.createElement('tr');
        
        // Если пара закреплена, добавляем класс
        if (pair.is_pinned) {
            row.classList.add('pinned');
        }
        
        // Сохраняем время обновления для таймера
        if (pair.alive_time) {
            row.dataset.aliveTime = pair.alive_time.$date || pair.alive_time;
        }
        
        // Создаем каждую ячейку отдельно и добавляем в строку
        // 1. Пара
        const pairCell = document.createElement('td');
        pairCell.textContent = pair.coin_pair;
        row.appendChild(pairCell);
        
        // 2. Сеть
        const networkCell = document.createElement('td');
        networkCell.className = 'list-network';
        networkCell.textContent = pair.network;
        row.appendChild(networkCell);
        
        // 3. Спред
        const spreadCell = document.createElement('td');
        spreadCell.className = `list-spread ${heatClass}`;
        spreadCell.textContent = '+' + formatPercent(pair.spread);
        row.appendChild(spreadCell);
        
        // 4. Покупка
        const buyCell = document.createElement('td');
        buyCell.textContent = `${pair.buy_exchange} ($${formatPrice(pair.buy_price)})`;
        row.appendChild(buyCell);
        
        // 5. Продажа
        const sellCell = document.createElement('td');
        sellCell.textContent = `${pair.sell_exchange} ($${formatPrice(pair.sell_price)})`;
        row.appendChild(sellCell);
        
        // 6. Объем
        const volumeCell = document.createElement('td');
        volumeCell.className = 'list-volume';
        volumeCell.textContent = '$' + formatNumber(pair.available_volume_usd);
        row.appendChild(volumeCell);
        
        // 7. Прибыль
        const profitCell = document.createElement('td');
        profitCell.className = 'list-profit';
        profitCell.textContent = '$' + formatNumber(pair.available_volume_usd * pair.spread / 100);
        row.appendChild(profitCell);
        
        // 8. Обновлено
        const timeCell = document.createElement('td');
        timeCell.className = 'list-updated';
        row.appendChild(timeCell);
        
        // Обновляем время для строки
        if (pair.alive_time) {
            updateElementTimer(timeCell, pair.alive_time.$date || pair.alive_time);
        }
        
        // Обработчик клика для строки (показ деталей)
        row.addEventListener('click', () => {
            showPairDetails(pair);
        });
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    scrollContainer.appendChild(table);
    container.appendChild(scrollContainer);
}

// Отображение деталей пары
function showPairDetails(pair) {
    // Очищаем таймер, если он существует
    if (detailsPanelTimerId) {
        clearInterval(detailsPanelTimerId);
        detailsPanelTimerId = null;
    }
    
    // Сохраняем ID текущей пары
    currentDetailsPairId = pair._id.$oid || pair._id;
    
    // Заполняем данные
    document.getElementById('detailsPairName').textContent = pair.coin_pair;
    document.getElementById('detailsNetwork').textContent = pair.network;
    
    const spreadElement = document.getElementById('detailsSpread');
    spreadElement.textContent = '+' + formatPercent(pair.spread);
    spreadElement.className = 'spread-badge ' + getHeatClass(pair.spread);
    
    document.getElementById('detailsBuyExchange').textContent = pair.buy_exchange;
    document.getElementById('detailsBuyPrice').textContent = '$' + formatPrice(pair.buy_price);
    
    document.getElementById('detailsSellExchange').textContent = pair.sell_exchange;
    document.getElementById('detailsSellPrice').textContent = '$' + formatPrice(pair.sell_price);
    
    document.getElementById('detailsVolume').textContent = '$' + formatNumber(pair.available_volume_usd);
    
    const commissionText = pair.commission + ' ' + pair.coin_pair.split('/')[0];
    document.getElementById('detailsCommission').textContent = commissionText;
    
    const profit = (pair.available_volume_usd * pair.spread / 100);
    document.getElementById('detailsProfit').textContent = '$' + formatNumber(profit);
    
    // Настройка кнопок действий
    const buyBtn = document.getElementById('detailsBuyBtn');
    buyBtn.querySelector('span:last-child').textContent = 'Купить на ' + pair.buy_exchange;
    buyBtn.onclick = function() {
        if (pair.buy_url && pair.buy_url !== '#') {
            window.open(pair.buy_url, '_blank');
        } else {
            showNotification('Ссылка для покупки недоступна', 'warning');
        }
    };
    
    const sellBtn = document.getElementById('detailsSellBtn');
    sellBtn.querySelector('span:last-child').textContent = 'Продать на ' + pair.sell_exchange;
    sellBtn.onclick = function() {
        if (pair.sell_url && pair.sell_url !== '#') {
            window.open(pair.sell_url, '_blank');
        } else {
            showNotification('Ссылка для продажи недоступна', 'warning');
        }
    };
    
    // Настройка кнопки закрепления
    const pinBtn = document.getElementById('detailsPinBtn');
    pinBtn.classList.toggle('active', pair.is_pinned);
    pinBtn.querySelector('span:last-child').textContent = pair.is_pinned ? 'Открепить' : 'Закрепить';
    
    pinBtn.onclick = async function() {
        if (!currentUser) {
            showNotification('Необходима авторизация', 'warning');
            return;
        }
        
        try {
            const pairId = pair._id.$oid || pair._id;
            
            if (pair.is_pinned) {
                await api.unpinPair(pairId, currentUser.telegram_id);
                pinBtn.classList.remove('active');
                pinBtn.querySelector('span:last-child').textContent = 'Закрепить';
            } else {
                await api.pinPair(pairId, currentUser.telegram_id);
                pinBtn.classList.add('active');
                pinBtn.querySelector('span:last-child').textContent = 'Открепить';
            }
            
            // Обновляем данные
            setTimeout(fetchData, 300);
            
            showNotification('Статус закрепления изменен', 'success');
        } catch (error) {
            console.error('Error toggling pin status:', error);
            showNotification('Ошибка при изменении статуса закрепления', 'error');
        }
    };
    
    // Обновляем время с точностью до секунд
    updateDetailsPanelTimer(pair);
    
    // Запускаем таймер для панели деталей
    startDetailsPanelTimer(pair);
    
    // Помечаем контейнер как имеющий открытую панель деталей
    window.DOM.mainContent.classList.add('details-open');
    
    // Показываем панель
    window.DOM.detailsPanel.classList.add('active');
    isDetailsPanelOpen = true;
}

// Обновление таймера в панели деталей с секундами
function updateDetailsPanelTimer(pair) {
    if (!pair.alive_time) return;
    
    const timerElement = document.getElementById('detailsUpdated');
    if (!timerElement) return;
    
    const now = new Date();
    const aliveTime = new Date(pair.alive_time.$date || pair.alive_time);
    const diffInSeconds = Math.floor((now - aliveTime) / 1000);
    
    // Расчет часов, минут и секунд
    const hours = Math.floor(diffInSeconds / 3600);
    const minutes = Math.floor((diffInSeconds % 3600) / 60);
    const seconds = diffInSeconds % 60;
    
    // Форматирование строки времени
    const timeStr = 
        (hours > 0 ? hours + 'ч ' : '') + 
        (minutes > 0 ? minutes + 'м ' : '') + 
        seconds + 'с назад';
    
    timerElement.textContent = timeStr;
}

// Запуск таймера для панели деталей
function startDetailsPanelTimer(pair) {
    if (!pair.alive_time) return;
    
    // Создаем новый таймер для обновления времени
    detailsPanelTimerId = setInterval(() => {
        updateDetailsPanelTimer(pair);
    }, 1000);
    
    return detailsPanelTimerId;
}

// Функция уведомления пользователя
function showNotification(message, type = 'info') {
    // Создаем элемент уведомления, если его нет
    let notification = document.querySelector('.toast');
    if (!notification) {
        notification = document.createElement('div');
        notification.className = 'toast';
        document.body.appendChild(notification);
    }
    
    // Устанавливаем стиль в зависимости от типа
    notification.className = 'toast';
    switch (type) {
        case 'success':
            notification.style.borderColor = 'var(--accent-green)';
            notification.style.color = 'var(--accent-green)';
            break;
        case 'error':
            notification.style.borderColor = 'var(--accent-red)';
            notification.style.color = 'var(--accent-red)';
            break;
        case 'warning':
            notification.style.borderColor = 'var(--heat-warm-2)';
            notification.style.color = 'var(--heat-warm-2)';
            break;
        default:
            notification.style.borderColor = 'var(--accent-blue)';
            notification.style.color = 'var(--accent-blue)';
    }
    
    // Устанавливаем текст
    notification.textContent = message;
    
    // Показываем уведомление
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Скрываем через 3 секунды
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Определение класса тепла по значению спреда
function getHeatClass(spread) {
    if (spread < 0.5) return 'cold';
    if (spread < 1) return 'cool';
    if (spread < 2) return 'warm';
    if (spread < 3) return 'warmer';
    if (spread < 5) return 'hot';
    return 'very-hot';
}

// Форматирование цены
function formatPrice(price) {
    if (price === undefined || price === null) return '0';
    
    let str = price.toString();
    
    if (str.includes('e')) {
        const parts = str.split('e');
        const base = parts[0];
        const exponent = parseInt(parts[1]);
        
        if (parts[1].includes('-')) {
            let result = '0.';
            for (let i = 0; i < Math.abs(exponent) - 1; i++) {
                result += '0';
            }
            return result + base.replace('.', '');
        } else {
            const baseWithoutDot = base.replace('.', '');
            const zerosToAdd = exponent - (baseWithoutDot.length - 1);
            let result = baseWithoutDot;
            for (let i = 0; i < zerosToAdd; i++) {
                result += '0';
            }
            return result;
        }
    }
    
    return str;
}

// Форматирование числа как валюты
function formatCurrency(value) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(value);
}

// Форматирование процентов
function formatPercent(value) {
    return value.toFixed(2) + '%';
}

// Форматирование чисел с разделителями разрядов
function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: 2
    }).format(value);
}
