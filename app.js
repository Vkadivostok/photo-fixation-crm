/**
 * app.js - Логика управления веб мини-CRM «Фотофиксация»
 */

const app = {
    // Состояние приложения
    state: {
        orders: [],
        currentOrder: null,
        currentStep: 1,
        activePhotoSlot: null,
        tempPhotos: {},
        tempDamages: [],
        tempSignature: null,
        selectedPart: null,
        selectedCoords: { x: 0, y: 0 },
        isDrawingSignature: false,
        lastDrawCoords: { x: 0, y: 0 },
        scanner: null,
        cameraStream: null,
        cameraFacingMode: 'environment'
    },

    // Инициализация при загрузке
    init() {
        console.log("Инициализация приложения...");
        
        // Автоматическое обновление демо-данных до новой версии с реальными фото
        const CURRENT_VERSION = '1.2';
        const installedVersion = localStorage.getItem('auto_crm_version');
        if (installedVersion !== CURRENT_VERSION) {
            localStorage.removeItem('auto_crm_orders');
            localStorage.setItem('auto_crm_version', CURRENT_VERSION);
        }

        this.loadOrders();
        
        // Если база пуста, наполняем демо-данными
        if (this.state.orders.length === 0) {
            this.generateMockOrders();
        }
        
        this.updateDashboardStats();
        this.renderOrdersList();
        this.setupSignatureCanvas();
        this.setupBlueprintClick();

        // Обработка клика вне модального окна для закрытия
        document.getElementById('damage-modal').addEventListener('click', (e) => {
            if (e.target.id === 'damage-modal') this.closeDamageModal();
        });
    },

    // Загрузка заказов из LocalStorage
    loadOrders() {
        try {
            const data = localStorage.getItem('auto_crm_orders');
            this.state.orders = data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Ошибка чтения LocalStorage:", e);
            this.state.orders = [];
        }
    },

    // Сохранение заказов в LocalStorage
    saveOrders() {
        try {
            localStorage.setItem('auto_crm_orders', JSON.stringify(this.state.orders));
            this.updateDashboardStats();
            this.renderOrdersList();
        } catch (e) {
            alert("Ошибка сохранения: память переполнена. Пожалуйста, делайте снимки меньшего размера.");
            console.error("Ошибка сохранения в LocalStorage:", e);
        }
    },

    // Переключение экранов
    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        
        const targetView = document.getElementById(`${viewId}-view`);
        if (targetView) targetView.classList.add('active');

        // Подсвечиваем пункт меню
        const navItem = document.getElementById(`nav-${viewId}`);
        if (navItem) navItem.classList.add('active');

        // Дополнительные хуки при открытии видов
        if (viewId === 'dashboard') {
            this.updateDashboardStats();
            this.renderOrdersList();
            this.stopScanner();
        }
    },

    // Обновление статистики на дашборде
    updateDashboardStats() {
        const total = this.state.orders.length;
        const active = this.state.orders.filter(o => o.status === 'active').length;
        
        document.getElementById('stats-total').textContent = total;
        document.getElementById('stats-active').textContent = active;
        document.getElementById('orders-count').textContent = total;
    },

    // Рендеринг списка заказов на главном экране
    renderOrdersList(filteredOrders = null) {
        const listContainer = document.getElementById('orders-list');
        listContainer.innerHTML = '';

        const ordersToRender = filteredOrders || this.state.orders;

        if (ordersToRender.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center text-muted" style="padding: 40px 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                    Заказ-наряды не найдены.<br>Создайте новую приемку, нажав кнопку «+».
                </div>
            `;
            return;
        }

        // Сортировка: сначала активные (в работе), потом завершенные
        const sorted = [...ordersToRender].sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            return new Date(b.date) - new Date(a.date);
        });

        sorted.forEach(order => {
            const card = document.createElement('div');
            card.className = 'order-card';
            card.onclick = () => this.openOrderDetails(order.id);

            const statusBadge = order.status === 'active' 
                ? '<span class="badge badge-warning">В работе</span>' 
                : '<span class="badge badge-success">Выдан (Выполнено)</span>';

            const defectsCount = order.damages ? order.damages.length : 0;
            const photosCount = Object.keys(order.photos || {}).length;

            card.innerHTML = `
                <div class="order-card-header">
                    <div>
                        <div class="order-id"># ${order.id}</div>
                        <div class="order-car">${order.carBrand}</div>
                    </div>
                    ${statusBadge}
                </div>
                <div class="order-card-meta">
                    <div class="meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <span>${this.formatDate(order.date)}</span>
                    </div>
                    <div class="meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <span>Дефектов: ${defectsCount}</span>
                    </div>
                    <div class="meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                        <span>Фото: ${photosCount}</span>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    },

    // Поиск по заказам
    searchOrders() {
        const query = document.getElementById('search-input').value.trim().toLowerCase();
        if (!query) {
            this.renderOrdersList();
            return;
        }

        const filtered = this.state.orders.filter(o => 
            o.id.toLowerCase().includes(query) || 
            o.carBrand.toLowerCase().includes(query) ||
            (o.carPlate && o.carPlate.toLowerCase().includes(query))
        );
        this.renderOrdersList(filtered);
    },

    // Запуск мастера приемки (Новый осмотр)
    startNewInspection() {
        this.state.currentStep = 1;
        this.state.tempPhotos = {};
        this.state.tempDamages = [];
        this.state.tempSignature = null;
        
        // Чистим поля формы
        document.getElementById('order-number').value = '';
        document.getElementById('car-brand').value = '';
        document.getElementById('car-plate').value = '';
        document.getElementById('car-mileage').value = '';
        document.getElementById('order-desc').value = '';
        document.getElementById('wizard-notes').value = '';

        // Сброс визуализации фоток
        document.querySelectorAll('.photo-slot').forEach(slot => {
            const label = slot.querySelector('.photo-slot-label').textContent;
            slot.className = 'photo-slot';
            slot.innerHTML = `
                <svg class="photo-slot-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                <span class="photo-slot-label">${label}</span>
            `;
        });

        // Сброс подписи и схемы повреждений
        this.clearSignature();
        this.clearBlueprintMarkers();
        this.renderWizardDamages();

        this.updateWizardStepView();
        document.getElementById('wizard-title').textContent = "Новый осмотр автомобиля";
        this.showView('wizard');
    },

    // Шаги мастера
    updateWizardStepView() {
        // Скрываем все шаги
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
        // Показываем текущий
        document.getElementById(`step-${this.state.currentStep}`).classList.add('active');

        // Обновляем индикаторы сверху
        document.querySelectorAll('.step-dot').forEach(dot => {
            const stepNum = parseInt(dot.dataset.step);
            dot.className = 'step-dot';
            if (stepNum === this.state.currentStep) {
                dot.classList.add('active');
            } else if (stepNum < this.state.currentStep) {
                dot.classList.add('completed');
                dot.innerHTML = '✓';
            } else {
                dot.innerHTML = stepNum;
            }
        });

        // Стили кнопок управления
        const prevBtn = document.getElementById('btn-wizard-prev');
        const nextBtn = document.getElementById('btn-wizard-next');

        if (this.state.currentStep === 1) {
            prevBtn.style.visibility = 'hidden';
        } else {
            prevBtn.style.visibility = 'visible';
        }

        if (this.state.currentStep === 5) {
            nextBtn.textContent = 'Сохранить';
            nextBtn.className = 'btn btn-primary';
        } else {
            nextBtn.textContent = 'Далее';
            nextBtn.className = 'btn btn-primary';
        }
    },

    wizardNext() {
        if (this.state.currentStep === 1) {
            // Валидация шага 1
            const orderNum = document.getElementById('order-number').value.trim();
            const brand = document.getElementById('car-brand').value.trim();
            
            if (!orderNum) {
                alert("Пожалуйста, укажите номер заказ-наряда!");
                return;
            }
            if (!brand) {
                alert("Пожалуйста, укажите марку и модель автомобиля!");
                return;
            }
        }

        if (this.state.currentStep < 5) {
            this.state.currentStep++;
            this.updateWizardStepView();
            // Если переходим на шаг с подписью, нужно подстроить размер canvas
            if (this.state.currentStep === 5) {
                setTimeout(() => this.resizeSignatureCanvas(), 100);
            }
        } else {
            // Шаг 5: Сохранение приемки
            this.saveInspection();
        }
    },

    wizardPrev() {
        if (this.state.currentStep > 1) {
            this.state.currentStep--;
            this.updateWizardStepView();
        }
    },

    // Триггер съемки фото (Камера онлайн через WebRTC)
    triggerPhotoUpload(slotId) {
        this.state.activePhotoSlot = slotId;
        this.openCameraModal();
    },

    openCameraModal() {
        const modal = document.getElementById('camera-modal');
        if (modal) modal.classList.add('active');
        this.startCameraStream();
    },

    closeCameraModal() {
        this.stopCameraStream();
        const modal = document.getElementById('camera-modal');
        if (modal) modal.classList.remove('active');
    },

    startCameraStream() {
        this.stopCameraStream(); // Останавливаем прошлый поток
        
        const video = document.getElementById('camera-stream-video');
        if (!video) return;

        const constraints = {
            video: {
                facingMode: this.state.cameraFacingMode,
                width: { ideal: 1024 },
                height: { ideal: 768 }
            },
            audio: false
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                this.state.cameraStream = stream;
                video.srcObject = stream;
            })
            .catch(err => {
                console.error("Не удалось запустить видеопоток камеры:", err);
                alert("Ошибка: Камера заблокирована или недоступна. Пожалуйста, предоставьте доступ к камере в настройках браузера.");
                this.closeCameraModal();
            });
    },

    stopCameraStream() {
        if (this.state.cameraStream) {
            this.state.cameraStream.getTracks().forEach(track => track.stop());
            this.state.cameraStream = null;
        }
        const video = document.getElementById('camera-stream-video');
        if (video) video.srcObject = null;
    },

    captureCameraPhoto() {
        const video = document.getElementById('camera-stream-video');
        if (!video || !this.state.cameraStream) return;

        // Создаем холст для захвата кадра
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        
        const ctx = canvas.getContext('2d');
        
        // Зеркалим изображение при фронтальной съемке
        if (this.state.cameraFacingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Сжатый JPEG
        const base64Data = canvas.toDataURL('image/jpeg', 0.85);

        // Обработка сохранения фото
        const slotName = this.state.activePhotoSlot;

        if (slotName === 'damage-temp') {
            // Временный снимок дефекта
            this.state.tempPhotos['damage-temp'] = base64Data;
            this.updatePhotoSlotView('slot-damage-photo', base64Data, 'Фото дефекта');
        } else if (slotName.startsWith('res-')) {
            // Фото результата работ
            if (!this.state.currentOrder.resultPhotos) {
                this.state.currentOrder.resultPhotos = {};
            }
            this.state.currentOrder.resultPhotos[slotName] = base64Data;
            this.setupResultPhotoSlots(this.state.currentOrder);
            this.saveOrders();
            this.renderReport(this.state.currentOrder); // Обновляем печатный вид
        } else {
            // Стандартный шаг осмотра (периметр или салон)
            this.state.tempPhotos[slotName] = base64Data;
            this.updatePhotoSlotView(`slot-${slotName}`, base64Data);
        }

        this.closeCameraModal();
    },

    toggleCameraFacing() {
        this.state.cameraFacingMode = this.state.cameraFacingMode === 'environment' ? 'user' : 'environment';
        this.startCameraStream();
    },

    // Обновление превью фото в слоте
    updatePhotoSlotView(elementId, base64Data, customLabel = null) {
        const slot = document.getElementById(elementId);
        if (!slot) return;

        const dateStr = this.formatDate(new Date(), true);
        
        slot.className = 'photo-slot filled';
        slot.innerHTML = `
            <img src="${base64Data}" alt="Фото">
            <button class="delete-photo-btn" onclick="app.deletePhoto(event, '${elementId}')">✕</button>
            <div class="photo-slot-meta">
                <span>Фотофиксация</span>
                <span>${dateStr}</span>
            </div>
        `;
    },

    // Удаление фото из слота
    deletePhoto(event, elementId) {
        event.stopPropagation(); // Предотвращаем повторный клик на слот
        
        // Очищаем в стейте
        if (elementId === 'slot-damage-photo') {
            delete this.state.tempPhotos['damage-temp'];
            const slot = document.getElementById(elementId);
            if (slot) {
                slot.className = 'photo-slot';
                slot.innerHTML = `
                    <svg class="photo-slot-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                    <span class="photo-slot-label">Сделать снимок дефекта</span>
                `;
            }
        } else if (elementId.startsWith('slot-res-')) {
            const actualKey = elementId.replace('slot-', '');
            if (this.state.currentOrder.resultPhotos) {
                delete this.state.currentOrder.resultPhotos[actualKey];
            }
            this.setupResultPhotoSlots(this.state.currentOrder);
            this.saveOrders();
            this.renderReport(this.state.currentOrder); // Обновляем печатный вид
        } else {
            const key = elementId.replace('slot-', '');
            delete this.state.tempPhotos[key];
            const slot = document.getElementById(elementId);
            if (slot) {
                const labelMap = {
                    'slot-ext-front': 'Спереди',
                    'slot-ext-back': 'Сзади',
                    'slot-ext-left': 'Слева (Бок)',
                    'slot-ext-right': 'Справа (Бок)',
                    'slot-int-dash': 'Приборная панель',
                    'slot-int-front': 'Передний ряд',
                    'slot-int-back': 'Задний ряд',
                    'slot-int-trunk': 'Багажник / Доп.'
                };
                const defaultLabel = labelMap[elementId] || 'Сделать фото';
                slot.className = 'photo-slot';
                slot.innerHTML = `
                    <svg class="photo-slot-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                    <span class="photo-slot-label">${defaultLabel}</span>
                `;
            }
        }
    },

    // Интерактивная карта (SVG клики)
    setupBlueprintClick() {
        const schematic = document.getElementById('car-schematic');
        if (!schematic) return;

        schematic.addEventListener('click', (e) => {
            const part = e.target.closest('.car-part');
            if (!part) return;

            const partName = part.getAttribute('data-part');
            
            // Нам нужно получить точные координаты клика внутри контейнера blueprint-wrapper
            const container = document.getElementById('blueprint-wrapper');
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Вычисляем проценты, чтобы маркеры корректно масштабировались
            const xPercent = (x / rect.width) * 100;
            const yPercent = (y / rect.height) * 100;

            this.state.selectedPart = partName;
            this.state.selectedCoords = { x: xPercent, y: yPercent };

            // Показываем модальное окно добавления повреждения
            this.openDamageModal(partName);
        });
    },

    openDamageModal(partName) {
        document.getElementById('damage-part-name').value = partName;
        document.getElementById('damage-type').selectedIndex = 0;
        
        // Сбрасываем временное фото
        delete this.state.tempPhotos['damage-temp'];
        const photoSlot = document.getElementById('slot-damage-photo');
        photoSlot.className = 'photo-slot';
        photoSlot.innerHTML = `
            <svg class="photo-slot-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span class="photo-slot-label">Сделать снимок дефекта</span>
        `;

        document.getElementById('damage-modal').classList.add('active');
    },

    closeDamageModal() {
        document.getElementById('damage-modal').classList.remove('active');
    },

    // Сохранение маркера повреждения
    saveDamageMarker() {
        const type = document.getElementById('damage-type').value;
        const part = this.state.selectedPart;
        const coords = this.state.selectedCoords;
        const photo = this.state.tempPhotos['damage-temp'];

        if (!photo) {
            alert("Пожалуйста, обязательно сфотографируйте дефект!");
            return;
        }

        const newDamage = {
            id: Date.now(),
            part: part,
            type: type,
            x: coords.x,
            y: coords.y,
            photo: photo
        };

        this.state.tempDamages.push(newDamage);
        
        // Рисуем точку на карте
        this.addMarkerToBlueprint(newDamage);
        this.renderWizardDamages();
        this.closeDamageModal();
    },

    // Отрисовка одной красной точки на интерактивном кузове
    addMarkerToBlueprint(damage) {
        const container = document.getElementById('blueprint-wrapper');
        const marker = document.createElement('div');
        marker.className = 'damage-marker';
        marker.style.left = `${damage.x}%`;
        marker.style.top = `${damage.y}%`;
        marker.dataset.id = damage.id;
        
        // Подсказка при наведении
        marker.title = `${damage.part}: ${damage.type}`;
        
        // Клик по маркеру для удаления
        marker.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Удалить отметку дефекта: ${damage.part} (${damage.type})?`)) {
                this.removeDamageMarker(damage.id);
            }
        };

        container.appendChild(marker);
    },

    removeDamageMarker(damageId) {
        // Убираем из стейта
        this.state.tempDamages = this.state.tempDamages.filter(d => d.id !== damageId);
        
        // Убираем визуальный элемент
        const marker = document.querySelector(`.damage-marker[data-id="${damageId}"]`);
        if (marker) marker.remove();

        this.renderWizardDamages();
    },

    clearBlueprintMarkers() {
        document.querySelectorAll('.damage-marker').forEach(m => m.remove());
    },

    // Отрисовка списка дефектов на Шаге 4
    renderWizardDamages() {
        const container = document.getElementById('wizard-damages-list');
        const countBadge = document.getElementById('damages-count');
        
        countBadge.textContent = this.state.tempDamages.length;

        if (this.state.tempDamages.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted" style="font-size: 0.85rem; padding: 15px;">
                    Дефекты не обнаружены. Кликните по кузову для фиксации.
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.state.tempDamages.forEach(d => {
            const item = document.createElement('div');
            item.className = 'damage-item-card';
            item.innerHTML = `
                <div class="damage-item-info">
                    <img src="${d.photo}" class="damage-item-img" alt="Дефект">
                    <div>
                        <div class="damage-item-text" style="color: var(--primary);">${d.part}</div>
                        <div class="text-muted" style="font-size: 0.75rem;">${d.type}</div>
                    </div>
                </div>
                <button class="delete-photo-btn" style="position: static;" onclick="app.removeDamageMarker(${d.id})">✕</button>
            `;
            container.appendChild(item);
        });
    },

    // Подпись клиента (Signature Pad на HTML5 Canvas)
    setupSignatureCanvas() {
        const canvas = document.getElementById('signature-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        const getMousePos = (canvasDom, mouseEvent) => {
            const rect = canvasDom.getBoundingClientRect();
            return {
                x: mouseEvent.clientX - rect.left,
                y: mouseEvent.clientY - rect.top
            };
        };

        const getTouchPos = (canvasDom, touchEvent) => {
            const rect = canvasDom.getBoundingClientRect();
            return {
                x: touchEvent.touches[0].clientX - rect.left,
                y: touchEvent.touches[0].clientY - rect.top
            };
        };

        const draw = (pos1, pos2) => {
            ctx.beginPath();
            ctx.moveTo(pos1.x, pos1.y);
            ctx.lineTo(pos2.x, pos2.y);
            ctx.strokeStyle = '#fff'; // белая кисть
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.stroke();
        };

        // Мышь
        canvas.addEventListener('mousedown', (e) => {
            this.state.isDrawingSignature = true;
            this.state.lastDrawCoords = getMousePos(canvas, e);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!this.state.isDrawingSignature) return;
            const currentPos = getMousePos(canvas, e);
            draw(this.state.lastDrawCoords, currentPos);
            this.state.lastDrawCoords = currentPos;
        });

        window.addEventListener('mouseup', () => {
            this.state.isDrawingSignature = false;
        });

        // Тач (Мобильные устройства)
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.state.isDrawingSignature = true;
            this.state.lastDrawCoords = getTouchPos(canvas, e);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.state.isDrawingSignature) return;
            const currentPos = getTouchPos(canvas, e);
            draw(this.state.lastDrawCoords, currentPos);
            this.state.lastDrawCoords = currentPos;
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            this.state.isDrawingSignature = false;
        });
    },

    resizeSignatureCanvas() {
        const canvas = document.getElementById('signature-canvas');
        if (!canvas) return;
        
        // Сохраняем содержимое перед ресайзом
        const tempCtx = canvas.getContext('2d');
        const tempImgData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
        
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = 120; // фиксированная высота
        
        // Восстанавливаем
        tempCtx.putImageData(tempImgData, 0, 0);
    },

    clearSignature() {
        const canvas = document.getElementById('signature-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.state.tempSignature = null;
    },

    // Сохранение инспекции в общую БД
    saveInspection() {
        const orderNum = document.getElementById('order-number').value.trim();
        const brand = document.getElementById('car-brand').value.trim();
        const plate = document.getElementById('car-plate').value.trim().toUpperCase();
        const mileage = document.getElementById('car-mileage').value.trim();
        const desc = document.getElementById('order-desc').value.trim();
        const notes = document.getElementById('wizard-notes').value.trim();

        // Проверяем подпись
        const canvas = document.getElementById('signature-canvas');
        
        // Определение, рисовал ли кто-то (canvas не должен быть полностью пустым)
        const isCanvasBlank = (c) => {
            const blank = document.createElement('canvas');
            blank.width = c.width;
            blank.height = c.height;
            return c.toDataURL() === blank.toDataURL();
        };

        if (isCanvasBlank(canvas)) {
            alert("Пожалуйста, попросите клиента поставить подпись в Шаге 5!");
            return;
        }

        const signatureBase64 = canvas.toDataURL();

        // Формируем заказ
        const newOrder = {
            id: orderNum,
            carBrand: brand,
            carPlate: plate,
            carMileage: mileage,
            orderDesc: desc,
            notes: notes,
            date: new Date().toISOString(),
            status: 'active', // по умолчанию заказ в работе
            photos: { ...this.state.tempPhotos },
            damages: [ ...this.state.tempDamages ],
            clientSignature: signatureBase64,
            resultPhotos: {}
        };

        // Добавляем или перезаписываем
        const index = this.state.orders.findIndex(o => o.id === orderNum);
        if (index > -1) {
            if (confirm(`Заказ-наряд № ${orderNum} уже существует. Перезаписать?`)) {
                this.state.orders[index] = newOrder;
            } else {
                return;
            }
        } else {
            this.state.orders.push(newOrder);
        }

        this.saveOrders();
        alert("Осмотр автомобиля успешно зафиксирован и сохранен!");
        
        // Сразу открываем готовый отчет
        this.openOrderDetails(orderNum);
    },

    // Открытие деталей заказа
    openOrderDetails(orderId) {
        const order = this.state.orders.find(o => o.id === orderId);
        if (!order) return;

        this.state.currentOrder = order;

        // Строим отчет
        this.renderReport(order);

        // Показываем кнопки сдачи работ, если статус заказа "В работе"
        const workActions = document.getElementById('work-result-actions');
        if (order.status === 'active') {
            workActions.style.display = 'flex';
            this.setupResultPhotoSlots(order);
        } else {
            workActions.style.display = 'none';
        }

        this.showView('report');
    },

    // Отрисовка отчета
    renderReport(order) {
        const container = document.getElementById('report-card-content');
        
        // Разметка точек повреждений на кузове для отчета (статическое отображение)
        let markersHTML = '';
        order.damages.forEach(d => {
            markersHTML += `
                <div class="damage-marker" style="left: ${d.x}%; top: ${d.y}%; pointer-events: none;" title="${d.part}: ${d.type}"></div>
            `;
        });

        // Карточки дефектов
        let defectsListHTML = '';
        if (order.damages.length === 0) {
            defectsListHTML = '<p class="text-muted">Кузовные дефекты отсутствуют.</p>';
        } else {
            order.damages.forEach(d => {
                defectsListHTML += `
                    <div class="damage-item-card" style="background: rgba(255,255,255,0.01);">
                        <div class="damage-item-info">
                            <img src="${d.photo}" class="damage-item-img" alt="Дефект" onclick="app.viewFullImage('${d.photo}', '${d.part}: ${d.type}')" style="cursor:zoom-in;">
                            <div>
                                <div class="damage-item-text" style="color: var(--danger); font-weight:600;">${d.part}</div>
                                <div class="text-muted" style="font-size: 0.75rem;">Тип дефекта: ${d.type}</div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        // Фото периметра и салона
        const photoLabels = {
            'ext-front': 'Спереди',
            'ext-back': 'Сзади',
            'ext-left': 'Слева',
            'ext-right': 'Справа',
            'int-dash': 'Панель',
            'int-front': 'Салон пер.',
            'int-back': 'Салон зад.',
            'int-trunk': 'Багажник'
        };

        let photosHTML = '';
        Object.keys(order.photos).forEach(key => {
            photosHTML += `
                <div class="report-photo-thumb" onclick="app.viewFullImage('${order.photos[key]}', '${photoLabels[key] || key}')">
                    <img src="${order.photos[key]}" alt="Фото">
                    <div class="report-photo-tag">${photoLabels[key] || key}</div>
                </div>
            `;
        });

        if (!photosHTML) {
            photosHTML = '<p class="text-muted">Фотографии осмотра отсутствуют.</p>';
        }

        // Фото результатов работ
        let resultsHTML = '';
        if (order.resultPhotos && Object.keys(order.resultPhotos).length > 0) {
            let resThumbs = '';
            Object.keys(order.resultPhotos).forEach((key, idx) => {
                resThumbs += `
                    <div class="report-photo-thumb" onclick="app.viewFullImage('${order.resultPhotos[key]}', 'Результат ${idx+1}')">
                        <img src="${order.resultPhotos[key]}" alt="Результат">
                        <div class="report-photo-tag" style="background: rgba(46, 213, 115, 0.8);">Результат ${idx+1}</div>
                    </div>
                `;
            });
            
            resultsHTML = `
                <div class="report-section">
                    <div class="report-section-title">Результаты выполненных работ</div>
                    <div class="report-photos-grid" style="margin-top: 10px;">
                        ${resThumbs}
                    </div>
                </div>
            `;
        }

        const dateStr = this.formatDate(order.date);
        const statusLabel = order.status === 'active' 
            ? '<span class="badge badge-warning">В работе</span>' 
            : '<span class="badge badge-success">Работы сданы / Выдан</span>';

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h2 style="font-family: var(--font-mono); font-size:1.4rem;">Заказ-наряд № ${order.id}</h2>
                    <span class="text-muted" style="font-size:0.8rem;">Дата осмотра: ${dateStr}</span>
                </div>
                ${statusLabel}
            </div>

            <!-- ИНФОРМАЦИЯ О ТС -->
            <div class="report-section">
                <div class="report-section-title">Паспорт осмотра автомобиля</div>
                <div class="report-info-grid" style="margin-top: 10px;">
                    <div class="report-info-item">
                        <span>Автомобиль</span>
                        <span>${order.carBrand}</span>
                    </div>
                    <div class="report-info-item">
                        <span>Государственный номер</span>
                        <span>${order.carPlate || 'Не указан'}</span>
                    </div>
                    <div class="report-info-item">
                        <span>Показания пробега</span>
                        <span>${order.carMileage ? parseInt(order.carMileage).toLocaleString() + ' км' : 'Не указаны'}</span>
                    </div>
                    <div class="report-info-item">
                        <span>Причина обращения</span>
                        <span>${order.orderDesc || 'Ремонтные работы'}</span>
                    </div>
                </div>
            </div>

            <!-- ФОТОФИКСАЦИЯ ПЕРИМЕТРА И САЛОНА -->
            <div class="report-section">
                <div class="report-section-title">Фотографии осмотра (Приемка)</div>
                <div class="report-photos-grid" style="margin-top: 10px;">
                    ${photosHTML}
                </div>
            </div>

            <!-- ИНТЕРАКТИВНАЯ КАРТА ДЕФЕКТОВ -->
            <div class="report-section">
                <div class="report-section-title">Карта обнаруженных повреждений кузова</div>
                <div class="schematic-container" style="background: rgba(255,255,255,0.01); min-height: 200px; pointer-events: none; margin-top: 10px;">
                    <svg viewBox="0 0 350 250" class="car-svg" style="max-width:240px;">
                        <!-- Вид сверху (Center) -->
                        <g>
                            <path class="car-part" d="M 120 70 L 160 70 L 155 100 L 125 100 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                            <rect class="car-part" x="120" y="105" width="40" height="50" rx="3" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></rect>
                            <path class="car-part" d="M 120 160 L 160 160 L 158 185 L 122 185 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                            <path class="car-part" d="M 115 60 L 165 60 L 160 70 L 120 70 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                            <path class="car-part" d="M 120 185 L 160 185 L 162 195 L 118 195 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                        </g>
                        <!-- Левая сторона -->
                        <g>
                            <path class="car-part" d="M 100 70 L 120 70 L 125 100 L 105 100 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                            <rect class="car-part" x="95" y="105" width="22" height="23" rx="1" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></rect>
                            <rect class="car-part" x="95" y="131" width="22" height="23" rx="1" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></rect>
                            <path class="car-part" d="M 100 160 L 120 160 L 122 185 L 102 185 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                        </g>
                        <!-- Правая сторона -->
                        <g>
                            <path class="car-part" d="M 160 70 L 180 70 L 175 100 L 155 100 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                            <rect class="car-part" x="163" y="105" width="22" height="23" rx="1" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></rect>
                            <rect class="car-part" x="163" y="131" width="22" height="23" rx="1" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></rect>
                            <path class="car-part" d="M 160 160 L 180 160 L 178 185 L 158 185 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                        </g>
                        <!-- Стекла -->
                        <g>
                            <path class="car-part" d="M 124 100 L 156 100 L 158 105 L 122 105 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                            <path class="car-part" d="M 122 155 L 158 155 L 156 160 L 124 160 Z" style="fill:rgba(255,255,255,0.02); stroke: var(--border-color);"></path>
                        </g>
                        <rect x="86" y="80" width="8" height="18" rx="2" fill="#333" stroke="var(--border-color)"></rect>
                        <rect x="186" y="80" width="8" height="18" rx="2" fill="#333" stroke="var(--border-color)"></rect>
                        <rect x="86" y="160" width="8" height="18" rx="2" fill="#333" stroke="var(--border-color)"></rect>
                        <rect x="186" y="160" width="8" height="18" rx="2" fill="#333" stroke="var(--border-color)"></rect>
                    </svg>
                    ${markersHTML}
                </div>
            </div>

            <!-- СПИСОК ДЕФЕКТОВ С ФОТО -->
            <div class="report-section">
                <div class="report-section-title">Ведомость кузовных дефектов</div>
                <div class="damages-list-container" style="max-height:none; overflow:visible; margin-top: 10px;">
                    ${defectsListHTML}
                </div>
            </div>

            <!-- РЕЗУЛЬТАТЫ РАБОТ (ЕСЛИ ЕСТЬ) -->
            ${resultsHTML}

            <!-- ЗАКЛЮЧЕНИЕ / ПРИМЕЧАНИЯ -->
            <div class="report-section">
                <div class="report-section-title">Примечания мастера</div>
                <p style="font-size:0.85rem; margin-top:8px; line-height:1.4;">${order.notes || 'Дополнительные дефекты не зафиксированы. Претензий по комплектации автомобиля нет.'}</p>
            </div>

            <!-- ПОДПИСИ СТОРОН -->
            <div class="report-section">
                <div class="report-section-title">Подтверждение приемки</div>
                <div class="report-signatures">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span class="text-muted" style="font-size:0.75rem;">Мастер-приемщик</span>
                        <div class="signature-box" style="font-size:0.85rem; font-weight:bold; color:var(--primary);">Андрей П.</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span class="text-muted" style="font-size:0.75rem;">Клиент (Согласовано)</span>
                        <div class="signature-box">
                            <img src="${order.clientSignature}" alt="Подпись клиента">
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Настройка слотов для фотографии результатов работ (динамическое отображение)
    setupResultPhotoSlots(order) {
        const grid = document.getElementById('results-photo-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (!order.resultPhotos) {
            order.resultPhotos = {};
        }

        const keys = Object.keys(order.resultPhotos);
        if (keys.length === 0) {
            grid.innerHTML = `
                <div class="text-center text-muted" style="grid-column: span 2; font-size: 0.85rem; padding: 15px; border: 1px dashed var(--border-color); border-radius: var(--radius-sm); width: 100%;">
                    Фотографии результатов работ пока не добавлены.
                </div>
            `;
            return;
        }

        keys.forEach((key, idx) => {
            const slot = document.createElement('div');
            slot.className = 'photo-slot filled';
            slot.id = `slot-${key}`;
            
            const dateStr = this.formatDate(new Date(), true);
            
            slot.innerHTML = `
                <img src="${order.resultPhotos[key]}" alt="Фото результата">
                <button class="delete-photo-btn" onclick="app.deletePhoto(event, 'slot-${key}')">✕</button>
                <div class="photo-slot-meta">
                    <span>Результат ${idx + 1}</span>
                    <span>${dateStr}</span>
                </div>
            `;
            grid.appendChild(slot);
        });
    },

    // Добавление нового фото результата
    addNewResultPhotoSlot() {
        const order = this.state.currentOrder;
        if (!order) return;
        
        const slotId = `res-${Date.now()}`;
        this.triggerPhotoUpload(slotId);
    },

    // Завершить работы и выдать машину
    completeOrder() {
        const order = this.state.currentOrder;
        if (!order) return;

        if (!order.resultPhotos || Object.keys(order.resultPhotos).length === 0) {
            alert("Пожалуйста, добавьте хотя бы одну фотографию выполненной работы!");
            return;
        }

        order.status = 'completed';
        
        // Обновляем в общей БД
        const index = this.state.orders.findIndex(o => o.id === order.id);
        if (index > -1) {
            this.state.orders[index] = order;
        }

        this.saveOrders();
        alert("Заказ-наряд переведен в статус «Выполнен»! Автомобиль готов к выдаче клиенту.");
        
        // Обновляем отчет
        this.openOrderDetails(order.id);
    },

    // Увеличение картинок при клике в отчете
    viewFullImage(base64Data, title) {
        const viewer = document.createElement('div');
        viewer.style.position = 'fixed';
        viewer.style.top = '0';
        viewer.style.left = '0';
        viewer.style.width = '100vw';
        viewer.style.height = '100vh';
        viewer.style.backgroundColor = 'rgba(0,0,0,0.95)';
        viewer.style.display = 'flex';
        viewer.style.flexDirection = 'column';
        viewer.style.alignItems = 'center';
        viewer.style.justifyContent = 'center';
        viewer.style.zIndex = '999';
        viewer.style.cursor = 'zoom-out';
        
        viewer.innerHTML = `
            <div style="color:white; font-size:1.1rem; margin-bottom:15px; font-weight:600;">${title}</div>
            <img src="${base64Data}" style="max-width:90%; max-height:80%; border-radius:8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="color:#888; font-size:0.85rem; margin-top:15px;">Нажмите в любом месте для закрытия</div>
        `;
        
        viewer.onclick = () => viewer.remove();
        document.body.appendChild(viewer);
    },

    // ШТРИХКОД СКАНЕР
    startScanner(targetInputId = null) {
        this.showView('scanner');

        // Инициализируем библиотеку Html5Qrcode
        // Мы используем отложенный запуск, чтобы дать DOM перерисоваться
        setTimeout(() => {
            try {
                this.state.scanner = new Html5Qrcode("scanner-container-element");
                const config = { fps: 10, qrbox: { width: 250, height: 150 } };
                
                this.state.scanner.start(
                    { facingMode: "environment" }, 
                    config,
                    (decodedText) => {
                        // Успешный скан штрихкода
                        this.handleScanSuccess(decodedText, targetInputId);
                    },
                    (errorMessage) => {
                        // Ошибки сканирования в реальном времени (пропускаем в консоль)
                    }
                ).catch(err => {
                    console.warn("Камера не запущена. Вероятно, вы работаете на ПК.", err);
                });
            } catch (e) {
                console.error("Ошибка запуска сканера:", e);
            }
        }, 300);
    },

    stopScanner() {
        if (this.state.scanner) {
            this.state.scanner.stop().then(() => {
                this.state.scanner = null;
            }).catch(err => {
                console.error("Ошибка остановки сканера:", err);
            });
        }
        
        // Возвращаемся на предыдущий вид
        if (document.getElementById('scanner-view').classList.contains('active')) {
            if (this.state.currentStep > 1 && document.getElementById('wizard-view').style.display !== 'none') {
                this.showView('wizard');
            } else {
                this.showView('dashboard');
            }
        }
    },

    handleScanSuccess(decodedText, targetInputId) {
        // Сигнал об успехе (вибрация, если поддерживается)
        if (navigator.vibrate) navigator.vibrate(100);
        
        this.stopScanner();

        if (targetInputId) {
            // Если сканировали из поля в мастере
            document.getElementById(targetInputId).value = decodedText;
            this.showView('wizard');
        } else {
            // Если сканировали из дашборда для поиска/создания
            const existingOrder = this.state.orders.find(o => o.id === decodedText);
            if (existingOrder) {
                // Если заказ уже есть, открываем его
                this.openOrderDetails(decodedText);
            } else {
                // Если нет — создаем новый осмотр и подставляем номер
                this.startNewInspection();
                document.getElementById('order-number').value = decodedText;
            }
        }
    },

    // Симуляция сканирования на ПК
    simulateScan() {
        // Генерируем красивый номер заказ-наряда
        const randomNum = "WO-" + Math.floor(100000 + Math.random() * 900000);
        
        // Находим, какое текстовое поле мы заполняем
        const wizardActive = document.getElementById('wizard-view').classList.contains('active');
        const target = wizardActive ? 'order-number' : null;
        
        this.handleScanSuccess(randomNum, target);
    },

    // УТИЛИТЫ ФОРМАТИРОВАНИЯ
    formatDate(isoString, timeOnly = false) {
        const date = new Date(isoString);
        
        const pad = (n) => n.toString().padStart(2, '0');
        
        const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
        if (timeOnly) return timeStr;

        const dayStr = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
        return `${dayStr} в ${timeStr}`;
    },

    // ГЕНЕРАЦИЯ ДЕМО-ДАННЫХ
    generateMockOrders() {
        console.log("Генерация демонстрационной базы заказ-нарядов...");
        
        // Создаем вспомогательные холсты для миниатюрных картинок, чтобы база не была пустой
        const createMockPhoto = (text, bgColor, size = 150) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, size, size);
            
            // Сетка/диагональ для красоты
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(0,0); ctx.lineTo(size, size);
            ctx.moveTo(size, 0); ctx.lineTo(0, size);
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, size/2, size/2);
            return canvas.toDataURL('image/jpeg', 0.6);
        };

        const mockSignature = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 80;
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(20, 40);
            ctx.bezierCurveTo(40, 10, 80, 70, 120, 30);
            ctx.lineTo(160, 40);
            ctx.stroke();
            return canvas.toDataURL();
        };

        const mockOrders = [
            {
                id: "WO-2026-9481",
                carBrand: "Porsche Cayenne Coupe GTS",
                carPlate: "Х 999 ХХ 799",
                carMileage: "45300",
                orderDesc: "Периодическое ТО-3, устранение царапин бампера, полировка, детейлинг салона",
                notes: "Автомобиль в матовой защитной пленке, на капоте пленка имеет небольшое замятие. В багажнике находится детское кресло Britax. Уровень топлива - 3/4. Претензий по комплектации нет.",
                date: new Date(Date.now() - 4 * 3600000).toISOString(), // 4 часа назад
                status: 'active',
                photos: {
                    'ext-front': 'assets/cayenne-front.png',
                    'ext-back': 'assets/cayenne-back.png',
                    'ext-left': 'assets/cayenne-front.png',
                    'ext-right': 'assets/cayenne-back.png',
                    'int-dash': 'assets/cayenne-interior.png',
                    'int-front': createMockPhoto('Салон спереди', '#2d3436'),
                    'int-back': createMockPhoto('Салон сзади', '#2d3436'),
                    'int-trunk': createMockPhoto('Багажник с креслом', '#1e272e')
                },
                damages: [
                    {
                        id: 1,
                        part: "Передний Бампер",
                        type: "Царапина",
                        x: 40.5,
                        y: 25.2,
                        photo: 'assets/scratch-bumper.png'
                    },
                    {
                        id: 2,
                        part: "Дверь передняя левая",
                        type: "Вмятина",
                        x: 29.8,
                        y: 45.6,
                        photo: 'assets/dent-door.png'
                    }
                ],
                clientSignature: mockSignature(),
                resultPhotos: {}
            },
            {
                id: "WO-2026-8942",
                carBrand: "Audi e-tron Sportback",
                carPlate: "Е 456 КХ 77",
                carMileage: "28100",
                orderDesc: "Диагностика подвески, замена тормозных колодок по кругу",
                notes: "Повреждений кузова при приемке не обнаружено. Колесные диски чистые, без бордюрной болезни. Заказ выполнен в полном объеме.",
                date: new Date(Date.now() - 24 * 3600000).toISOString(), // день назад
                status: 'completed',
                photos: {
                    'ext-front': createMockPhoto('Audi Спереди', '#0984e3'),
                    'ext-back': createMockPhoto('Audi Сзади', '#0984e3'),
                    'ext-left': createMockPhoto('Audi Слева', '#0984e3'),
                    'ext-right': createMockPhoto('Audi Справа', '#0984e3'),
                    'int-dash': createMockPhoto('Панель e-tron', '#1e272e')
                },
                damages: [],
                clientSignature: mockSignature(),
                resultPhotos: {
                    'res-1': createMockPhoto('Новые колодки Brembo', '#00b894'),
                    'res-2': createMockPhoto('Выполненные работы', '#00b894')
                }
            }
        ];

        this.state.orders = mockOrders;
        this.saveOrders();
    }
};

// Запуск приложения
window.addEventListener('DOMContentLoaded', () => app.init());
