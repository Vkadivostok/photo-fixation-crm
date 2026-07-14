/**
 * app.js - демо-CRM для фотофиксации автомобиля до и после работ.
 */

const app = {
    config: {
        currentVersion: '2.0',
        storageKey: 'auto_crm_photo_reports',
        legacyOrdersKey: 'auto_crm_orders',
        versionKey: 'auto_crm_photo_reports_version',
        storageMode: 'local-demo'
    },

    storageAdapter: {
        load(config) {
            const data = localStorage.getItem(config.storageKey);
            const parsed = data ? JSON.parse(data) : [];
            return Array.isArray(parsed) ? parsed : [];
        },

        save(config, reports) {
            localStorage.setItem(config.storageKey, JSON.stringify(reports));
            localStorage.setItem(config.versionKey, config.currentVersion);
        },

        loadLegacy(config) {
            const data = localStorage.getItem(config.legacyOrdersKey);
            const parsed = data ? JSON.parse(data) : [];
            return Array.isArray(parsed) ? parsed : [];
        }
    },

    state: {
        reports: [],
        currentReport: null,
        activePhotoPhase: null,
        scanner: null,
        cameraStream: null,
        cameraFacingMode: 'environment'
    },

    init() {
        this.loadReports();

        if (this.state.reports.length === 0) {
            this.migrateLegacyOrders();
        }

        if (this.state.reports.length === 0) {
            this.generateDemoReports();
        }

        const orderInput = document.getElementById('order-number');
        if (orderInput) {
            orderInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') this.startReportFromInput();
            });
        }

        this.renderDashboard();
    },

    loadReports() {
        try {
            this.state.reports = this.storageAdapter
                .load(this.config)
                .map(report => this.normalizeReport(report))
                .filter(report => report.orderNumber);
        } catch (error) {
            console.error('Ошибка чтения локального хранилища:', error);
            this.state.reports = [];
        }
    },

    saveReports() {
        try {
            this.storageAdapter.save(this.config, this.state.reports);
            this.renderDashboard();
        } catch (error) {
            alert('Ошибка сохранения: локальная память браузера переполнена.');
            console.error('Ошибка сохранения фотоотчетов:', error);
        }
    },

    migrateLegacyOrders() {
        try {
            const legacyOrders = this.storageAdapter.loadLegacy(this.config);
            const migratedReports = legacyOrders
                .map(order => this.convertLegacyOrder(order))
                .filter(Boolean);

            if (migratedReports.length === 0) return;

            this.state.reports = migratedReports;
            this.state.reports.forEach(report => this.updateReportMeta(report));
            this.saveReports();
        } catch (error) {
            console.warn('Не удалось перенести старые демо-данные:', error);
        }
    },

    convertLegacyOrder(order = {}) {
        const orderNumber = this.normalizeOrderNumber(order.id);
        if (!orderNumber) return null;

        const beforePhotos = this.photosFromMap(order.photos, order.date, 'before');
        const afterPhotos = this.photosFromMap(order.resultPhotos, order.date, 'after');
        const report = {
            id: this.createId('report'),
            orderNumber,
            createdAt: order.date || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'draft',
            beforePhotos,
            afterPhotos,
            meta: {}
        };

        this.updateReportStatus(report);
        this.updateReportMeta(report);
        return report;
    },

    photosFromMap(photoMap, fallbackDate, prefix) {
        if (!this.isPlainObject(photoMap)) return [];

        return Object.values(photoMap)
            .map(src => this.safeImageSrc(src))
            .filter(Boolean)
            .map((src, index) => ({
                id: this.createId(`${prefix}-${index}`),
                src,
                capturedAt: fallbackDate || new Date().toISOString()
            }));
    },

    normalizeReport(report = {}) {
        const normalized = {
            id: this.normalizeText(report.id, 80) || this.createId('report'),
            orderNumber: this.normalizeOrderNumber(report.orderNumber || report.id),
            createdAt: report.createdAt || report.date || new Date().toISOString(),
            updatedAt: report.updatedAt || report.createdAt || new Date().toISOString(),
            status: report.status === 'completed' ? 'completed' : 'draft',
            beforePhotos: this.normalizePhotos(report.beforePhotos),
            afterPhotos: this.normalizePhotos(report.afterPhotos),
            meta: this.isPlainObject(report.meta) ? report.meta : {}
        };

        this.updateReportStatus(normalized);
        this.updateReportMeta(normalized);
        return normalized;
    },

    normalizePhotos(photos) {
        if (!Array.isArray(photos)) return [];

        return photos
            .map(photo => {
                const src = this.safeImageSrc(photo?.src || photo);
                if (!src) return null;

                return {
                    id: this.normalizeText(photo?.id, 80) || this.createId('photo'),
                    src,
                    capturedAt: photo?.capturedAt || new Date().toISOString()
                };
            })
            .filter(Boolean);
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(`${viewId}-view`);
        if (targetView) targetView.classList.add('active');

        if (viewId === 'dashboard') {
            this.stopScanner(false);
            this.stopCameraStream();
            this.renderDashboard();
        }
    },

    renderDashboard() {
        this.updateDashboardStats();
        this.searchReports();
    },

    updateDashboardStats() {
        const total = this.state.reports.length;
        const withoutAfter = this.state.reports.filter(report => report.afterPhotos.length === 0).length;

        this.setText('stats-total', total);
        this.setText('stats-active', withoutAfter);
        this.setText('orders-count', total);
    },

    searchReports() {
        const query = this.normalizeOrderNumber(document.getElementById('search-input')?.value || '');
        const reports = query
            ? this.state.reports.filter(report => report.orderNumber.toLowerCase().includes(query.toLowerCase()))
            : this.state.reports;

        this.renderReportsList(reports);
    },

    renderReportsList(reportsToRender) {
        const container = document.getElementById('reports-list');
        if (!container) return;

        container.innerHTML = '';
        const reports = [...reportsToRender].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        if (reports.length === 0) {
            container.innerHTML = '<div class="empty-state">Фотоотчеты не найдены</div>';
            return;
        }

        reports.forEach(report => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'report-card';
            card.addEventListener('click', () => this.openReport(report.id));

            const statusClass = report.status === 'completed' ? 'badge completed' : 'badge';
            const statusText = report.status === 'completed' ? 'Готов' : 'В работе';

            card.innerHTML = `
                <div class="list-header">
                    <div>
                        <div class="report-card-title"># ${this.escapeHTML(report.orderNumber)}</div>
                        <div class="text-muted">${this.escapeHTML(this.formatDate(report.updatedAt))}</div>
                    </div>
                    <span class="${statusClass}">${statusText}</span>
                </div>
                <div class="report-card-meta">
                    <span>До: ${report.beforePhotos.length}</span>
                    <span>После: ${report.afterPhotos.length}</span>
                </div>
            `;

            container.appendChild(card);
        });
    },

    startReportFromInput() {
        const rawValue = document.getElementById('order-number')?.value || '';
        const orderNumber = this.extractOrderNumber(rawValue);

        if (!orderNumber) {
            alert('Укажите или отсканируйте номер заказ-наряда.');
            return;
        }

        const report = this.findOrCreateReport(orderNumber);
        this.openReport(report.id);
    },

    findOrCreateReport(orderNumber) {
        const normalizedOrderNumber = this.normalizeOrderNumber(orderNumber);
        let report = this.state.reports.find(item => item.orderNumber === normalizedOrderNumber);

        if (report) return report;

        report = {
            id: this.createId('report'),
            orderNumber: normalizedOrderNumber,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'draft',
            beforePhotos: [],
            afterPhotos: [],
            meta: {}
        };

        this.updateReportMeta(report);
        this.state.reports.push(report);
        this.saveReports();
        return report;
    },

    openReport(reportId) {
        const report = this.state.reports.find(item => item.id === reportId);
        if (!report) return;

        this.state.currentReport = report;
        this.renderReport();
        this.showView('report');
    },

    renderReport() {
        const report = this.state.currentReport;
        if (!report) return;

        this.updateReportStatus(report);
        this.setText('report-order-number', `# ${report.orderNumber}`);
        this.setText('report-date', this.formatDate(report.createdAt));
        this.setText('before-count', report.beforePhotos.length);
        this.setText('after-count', report.afterPhotos.length);

        const statusBadge = document.getElementById('report-status');
        if (statusBadge) {
            statusBadge.className = report.status === 'completed' ? 'badge completed' : 'badge';
            statusBadge.textContent = report.status === 'completed' ? 'Готов' : 'В работе';
        }

        this.renderPhotoGrid('before');
        this.renderPhotoGrid('after');
    },

    renderPhotoGrid(phase) {
        const report = this.state.currentReport;
        const grid = document.getElementById(`${phase}-grid`);
        if (!report || !grid) return;

        const photos = this.getPhotos(report, phase);
        grid.innerHTML = '';

        if (photos.length === 0) {
            const emptyTile = document.createElement('div');
            emptyTile.className = 'photo-add-tile';
            emptyTile.textContent = phase === 'before' ? 'Нет фото до' : 'Нет фото после';
            grid.appendChild(emptyTile);
            return;
        }

        photos.forEach(photo => {
            const tile = document.createElement('div');
            tile.className = 'photo-tile';
            tile.addEventListener('click', () => this.viewFullImage(photo.src, this.phaseLabel(phase)));

            const image = document.createElement('img');
            image.src = photo.src;
            image.alt = this.phaseLabel(phase);

            const time = document.createElement('div');
            time.className = 'photo-time';
            time.textContent = this.formatDate(photo.capturedAt, true);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'delete-photo-btn no-print';
            deleteButton.textContent = '×';
            deleteButton.setAttribute('aria-label', 'Удалить фото');
            deleteButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.deletePhoto(phase, photo.id);
            });

            tile.append(image, time, deleteButton);
            grid.appendChild(tile);
        });
    },

    addPhoto(phase) {
        if (!this.state.currentReport) return;

        this.state.activePhotoPhase = phase;
        this.openCameraModal();
    },

    deletePhoto(phase, photoId) {
        const report = this.state.currentReport;
        if (!report) return;

        if (!confirm('Удалить фото из отчета?')) return;

        const field = this.photoField(phase);
        report[field] = report[field].filter(photo => photo.id !== photoId);
        report.updatedAt = new Date().toISOString();
        this.updateReportStatus(report);
        this.updateReportMeta(report);
        this.saveReports();
        this.renderReport();
    },

    openCameraModal() {
        const modal = document.getElementById('camera-modal');
        if (modal) modal.classList.add('active');
        this.removeCameraError();
        this.startCameraStream();
    },

    closeCameraModal() {
        this.stopCameraStream();
        this.removeCameraError();
        const modal = document.getElementById('camera-modal');
        if (modal) modal.classList.remove('active');
    },

    startCameraStream() {
        this.stopCameraStream();

        const video = document.getElementById('camera-stream-video');
        if (!video || !navigator.mediaDevices?.getUserMedia) {
            this.showCameraFallback();
            return;
        }

        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: this.state.cameraFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 960 }
            },
            audio: false
        }).then(stream => {
            this.state.cameraStream = stream;
            video.srcObject = stream;
        }).catch(error => {
            console.warn('Камера недоступна:', error);
            this.showCameraFallback();
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

    toggleCameraFacing() {
        this.state.cameraFacingMode = this.state.cameraFacingMode === 'environment' ? 'user' : 'environment';
        this.startCameraStream();
    },

    captureCameraPhoto() {
        const video = document.getElementById('camera-stream-video');
        if (!video || !this.state.cameraStream) {
            this.openFilePicker();
            return;
        }

        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 960;
        const canvas = this.createScaledCanvas(width, height);
        const ctx = canvas.getContext('2d');

        if (this.state.cameraFacingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        this.saveCapturedPhoto(canvas.toDataURL('image/jpeg', 0.82));
        this.closeCameraModal();
    },

    handleFilePhoto(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                const canvas = this.createScaledCanvas(image.naturalWidth, image.naturalHeight);
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                this.saveCapturedPhoto(canvas.toDataURL('image/jpeg', 0.82));
                this.closeCameraModal();
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    },

    saveCapturedPhoto(src) {
        const report = this.state.currentReport;
        const phase = this.state.activePhotoPhase;
        const safeSrc = this.safeImageSrc(src);
        if (!report || !phase || !safeSrc) return;

        this.getPhotos(report, phase).push({
            id: this.createId('photo'),
            src: safeSrc,
            capturedAt: new Date().toISOString()
        });

        report.updatedAt = new Date().toISOString();
        this.updateReportStatus(report);
        this.updateReportMeta(report);
        this.saveReports();
        this.renderReport();
    },

    showCameraFallback() {
        const shell = document.querySelector('.camera-shell');
        if (!shell || document.getElementById('camera-error-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'camera-error-overlay';
        overlay.style.cssText = [
            'position:absolute',
            'inset:0',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:20px',
            'background:#0b0c10',
            'z-index:3'
        ].join(';');
        overlay.innerHTML = `
            <div style="max-width:300px;text-align:center;">
                <h3 style="margin-bottom:10px;">Камера недоступна</h3>
                <button class="btn btn-primary btn-full" type="button" onclick="app.openFilePicker()">Выбрать фото</button>
            </div>
        `;
        shell.appendChild(overlay);
    },

    removeCameraError() {
        document.getElementById('camera-error-overlay')?.remove();
    },

    openFilePicker() {
        document.getElementById('photo-file-input')?.click();
    },

    startScanner(targetInputId = 'order-number') {
        this.showView('scanner');
        this.setText('scanner-status', '');

        if (typeof Html5Qrcode === 'undefined') {
            this.setText('scanner-status', 'Сканер не загрузился. Проверьте интернет или CDN.');
            return;
        }

        setTimeout(() => {
            try {
                this.state.scanner = new Html5Qrcode('scanner-container-element');
                this.state.scanner.start(
                    { facingMode: 'environment' },
                    this.scannerConfig(),
                    decodedText => this.handleScanSuccess(decodedText, targetInputId),
                    () => {}
                ).catch(error => {
                    console.warn('Не удалось запустить сканер:', error);
                    this.setText('scanner-status', 'Камера недоступна. Можно ввести номер вручную.');
                });
            } catch (error) {
                console.error('Ошибка запуска сканера:', error);
                this.setText('scanner-status', 'Ошибка запуска сканера.');
            }
        }, 250);
    },

    scannerConfig() {
        const config = {
            fps: 12,
            qrbox: { width: 280, height: 160 }
        };

        const formats = window.Html5QrcodeSupportedFormats;
        if (formats) {
            config.formatsToSupport = [
                formats.QR_CODE,
                formats.CODE_128,
                formats.CODE_39,
                formats.EAN_13,
                formats.EAN_8,
                formats.ITF,
                formats.UPC_A,
                formats.UPC_E
            ].filter(Boolean);
        }

        return config;
    },

    stopScanner(navigateBack = true) {
        const scanner = this.state.scanner;
        this.state.scanner = null;

        const finish = () => {
            if (navigateBack) this.showView('dashboard');
        };

        if (!scanner) {
            finish();
            return;
        }

        scanner.stop()
            .then(() => scanner.clear())
            .catch(error => console.warn('Ошибка остановки сканера:', error))
            .finally(finish);
    },

    handleScanSuccess(decodedText, targetInputId) {
        const orderNumber = this.extractOrderNumber(decodedText);
        if (!orderNumber) {
            this.setText('scanner-status', 'Номер заказ-наряда не распознан.');
            return;
        }

        if (navigator.vibrate) navigator.vibrate(80);
        this.stopScanner(false);

        const input = document.getElementById(targetInputId);
        if (input) input.value = orderNumber;

        const report = this.findOrCreateReport(orderNumber);
        this.openReport(report.id);
    },

    simulateScan() {
        const demoNumber = `WO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        this.handleScanSuccess(demoNumber, 'order-number');
    },

    extractOrderNumber(rawValue) {
        const raw = String(rawValue || '').trim();
        if (!raw) return '';

        const urlOrderNumber = this.extractOrderNumberFromUrl(raw);
        if (urlOrderNumber) return urlOrderNumber;

        const tokens = raw.split(/[\s;|,]+/).filter(Boolean);
        const orderPattern = /([A-ZА-ЯЁ]{1,8}[-_/]?\d{3,}(?:[-_/]?\d{1,})*)/i;

        for (const token of [raw, ...tokens]) {
            const match = token.match(orderPattern);
            if (match) return this.normalizeOrderNumber(match[1]);
        }

        const digits = raw.match(/\d{4,}/);
        if (digits) return this.normalizeOrderNumber(digits[0]);

        return this.normalizeOrderNumber(raw);
    },

    extractOrderNumberFromUrl(raw) {
        try {
            const url = new URL(raw);
            const keys = ['order', 'orderNumber', 'order_number', 'workOrder', 'wo', 'zn', 'id'];
            for (const key of keys) {
                const value = url.searchParams.get(key);
                const orderNumber = this.normalizeOrderNumber(value);
                if (orderNumber) return orderNumber;
            }
        } catch (_) {
            return '';
        }
        return '';
    },

    normalizeOrderNumber(value) {
        return String(value || '')
            .trim()
            .replace(/\s+/g, '')
            .replace(/[^0-9A-Za-zА-Яа-яЁё\-_/]/g, '')
            .slice(0, 64)
            .toUpperCase();
    },

    normalizeText(value, maxLength = 120) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    },

    safeImageSrc(value) {
        const src = String(value || '').trim();
        if (/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(src)) return src;
        if (/^assets\/[a-z0-9._/-]+\.(png|jpe?g|webp)$/i.test(src)) return src;
        if (/^https:\/\/[^\s"'<>]+$/i.test(src)) return src;
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"'<>]+$/i.test(src)) return src;
        return '';
    },

    escapeHTML(value) {
        const chars = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return String(value || '').replace(/[&<>"']/g, char => chars[char]);
    },

    isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    },

    createScaledCanvas(width, height) {
        const maxSide = 1280;
        const scale = Math.min(maxSide / width, maxSide / height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        return canvas;
    },

    updateReportStatus(report) {
        report.status = report.beforePhotos.length > 0 && report.afterPhotos.length > 0 ? 'completed' : 'draft';
    },

    updateReportMeta(report) {
        const snapshot = {
            orderNumber: report.orderNumber,
            createdAt: report.createdAt,
            status: report.status,
            before: report.beforePhotos.map(photo => ({
                capturedAt: photo.capturedAt,
                size: photo.src.length
            })),
            after: report.afterPhotos.map(photo => ({
                capturedAt: photo.capturedAt,
                size: photo.src.length
            }))
        };

        report.meta = {
            ...(report.meta || {}),
            schemaVersion: this.config.currentVersion,
            storageMode: this.config.storageMode,
            updatedAt: new Date().toISOString(),
            demoIntegrityHash: this.hashString(JSON.stringify(snapshot))
        };
    },

    hashString(value) {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    },

    getPhotos(report, phase) {
        return report[this.photoField(phase)];
    },

    photoField(phase) {
        return phase === 'after' ? 'afterPhotos' : 'beforePhotos';
    },

    phaseLabel(phase) {
        return phase === 'after' ? 'Фото после работ' : 'Фото до работ';
    },

    setText(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) element.textContent = String(value);
    },

    formatDate(isoString, timeOnly = false) {
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '';

        const pad = number => String(number).padStart(2, '0');
        const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
        if (timeOnly) return time;

        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} в ${time}`;
    },

    viewFullImage(src, title) {
        const safeSrc = this.safeImageSrc(src);
        if (!safeSrc) return;

        const viewer = document.createElement('div');
        viewer.className = 'image-viewer';

        const titleElement = document.createElement('div');
        titleElement.textContent = title;

        const image = document.createElement('img');
        image.src = safeSrc;
        image.alt = title;

        const closeText = document.createElement('div');
        closeText.className = 'text-muted';
        closeText.textContent = 'Нажмите для закрытия';

        viewer.append(titleElement, image, closeText);
        viewer.addEventListener('click', () => viewer.remove());
        document.body.appendChild(viewer);
    },

    generateDemoReports() {
        const now = new Date().toISOString();
        const report = {
            id: this.createId('report'),
            orderNumber: 'WO-2026-0001',
            createdAt: now,
            updatedAt: now,
            status: 'draft',
            beforePhotos: [
                { id: this.createId('photo'), src: 'assets/cayenne-front.png', capturedAt: now },
                { id: this.createId('photo'), src: 'assets/cayenne-back.png', capturedAt: now }
            ],
            afterPhotos: [],
            meta: {}
        };

        this.updateReportStatus(report);
        this.updateReportMeta(report);
        this.state.reports = [report];
        this.saveReports();
    },

    createId(prefix) {
        if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
};

window.addEventListener('DOMContentLoaded', () => app.init());
