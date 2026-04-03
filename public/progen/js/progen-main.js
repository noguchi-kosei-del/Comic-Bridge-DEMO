// progen-main.js
// ES Module エントリーポイント - 全モジュールを読み込む

// グローバル通知ダイアログ（<dialog> 要素ベース）
function showToast(message, type) {
    const dialog = document.getElementById('globalAlertDialog');
    const icon = document.getElementById('globalAlertIcon');
    const msg = document.getElementById('globalAlertMsg');
    if (!dialog) return Promise.resolve();

    const t = type || 'success';
    const icons = {
        success: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        error:   '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--warm-red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b47628" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };
    const bgColors = { success: '#edf7f1', error: '#fceeed', warning: '#fdf6ec' };
    icon.innerHTML = icons[t] || icons.success;
    icon.style.background = bgColors[t] || bgColors.success;
    msg.textContent = message;

    if (dialog.open) dialog.close();
    dialog.showModal();

    return new Promise(resolve => {
        dialog.addEventListener('close', resolve, { once: true });
    });
}
window.showToast = showToast;

import './progen-state.js';
import './progen-xml-templates.js';
import './progen-data.js';
import './progen-landing.js';
import './progen-extraction.js';
import './progen-xml-gen.js';
import './progen-check-simple.js';
import './progen-check-variation.js';
import './progen-proofreading.js';
import './progen-json-browser.js';
import './progen-admin.js';
import './progen-note-txt.js';
import './progen-result-viewer.js';
import './progen-comicpot.js';
import './progen-viewer.js';

// 全モジュール読み込み後に起動時の初期化を実行
window.init();
window.initJsonFolderBrowser();
window.initCalibrationFolderBrowser();

// ドロップゾーンの初期化（COMIC-Bridge統合版: テキストD&Dは親アプリで管理）
const proofreadingTxtDropZone = document.getElementById('proofreadingTxtDropZone');
if (proofreadingTxtDropZone) window.setupDropZone(proofreadingTxtDropZone, window.addProofreadingTxt);

// ═══ COMIC-Bridge統合: URLパラメータ + 一時ファイルでデータ連携 ═══
// React側がTauri invokeで %TEMP%/comic_bridge_progen_handoff.json にデータを書き出し
// こちらもTauri invokeで読み込む（window.parent参照は一切使わない）
(function () {
    var params = new URLSearchParams(window.location.search);
    var mode = params.get('mode');
    if (!mode) return;

    console.log('[ProGen] Auto-navigate to mode:', mode);

    var landing = document.getElementById('landingScreen');
    var main = document.getElementById('mainWrapper');
    var proofreading = document.getElementById('proofreadingPage');
    if (landing) landing.style.display = 'none';
    if (main) main.style.display = 'none';
    if (proofreading) proofreading.style.display = 'none';

    // Tauri invoke経由で一時ファイルを読み込む
    function readHandoff() {
        if (!window.electronAPI) return Promise.resolve(null);
        // progen_get_txt_folder_path はTXTフォルダパスだが、temp取得は別の方法
        // electronAPI経由でinvokeが使える: TAURI.core.invoke
        var TAURI = window.__TAURI__;
        if (!TAURI || !TAURI.core || !TAURI.core.invoke) return Promise.resolve(null);

        return TAURI.core.invoke('get_temp_dir').then(function (tempDir) {
            var filePath = tempDir + '\\comic_bridge_progen_handoff.json';
            return TAURI.core.invoke('read_text_file', { filePath: filePath });
        }).then(function (content) {
            return JSON.parse(content);
        }).catch(function () {
            return null;
        });
    }

    // テキスト注入
    function applyHandoff(data) {
        if (!data || !window.state) return;

        // テキスト
        if (data.textContent) {
            var fileObj = { name: data.textFileName || 'text.txt', content: data.textContent, size: data.textContent.length };
            window.state.manuscriptTxtFiles = [fileObj];
            window.state.txtGuideDismissed = true;
            window.state.proofreadingFiles = [fileObj];
            window.state.proofreadingContent = data.textContent;
        }

        // レーベル自動認識
        if (data.labelName) {
            // メイン画面
            var displayGroup = document.getElementById('labelDisplayGroup');
            var displayText = document.getElementById('labelDisplayText');
            var selectorGroup = document.getElementById('labelSelectorGroup');
            if (displayGroup && displayText) {
                if (selectorGroup) selectorGroup.style.display = 'none';
                displayGroup.style.display = 'flex';
                displayText.textContent = data.labelName;
            }
            // 校正ページ
            var proofSelectorText = document.getElementById('proofreadingLabelSelectorText');
            if (proofSelectorText) {
                proofSelectorText.textContent = data.labelName;
                proofSelectorText.classList.remove('unselected');
            }
            // マスタールール読み込み
            var proofSelector = document.getElementById('proofreadingLabelSelect');
            if (proofSelector) {
                var opts = proofSelector.querySelectorAll('option');
                for (var i = 0; i < opts.length; i++) {
                    if (opts[i].value === data.labelName || opts[i].textContent === data.labelName) {
                        proofSelector.value = opts[i].value;
                        if (window.loadLabelRulesForProofreading) window.loadLabelRulesForProofreading(opts[i].value);
                        break;
                    }
                }
            }
        }
    }

    // モード遷移
    function navigateToMode() {
        try {
            if (mode === 'proofreading') {
                if (proofreading) proofreading.style.display = 'flex';
                if (window.state) {
                    window.state.currentProofreadingMode = 'simple';
                    window.state.proofreadingReturnTo = 'landing';
                }
                document.querySelectorAll('.proofreading-mode-btn').forEach(function(btn) {
                    btn.classList.toggle('active', btn.dataset.mode === 'simple');
                });
                if (window.updateProofreadingCheckItems) window.updateProofreadingCheckItems();
                if (window.updateProofreadingOptionsLabel) window.updateProofreadingOptionsLabel();
                if (window.renderProofreadingFileList) window.renderProofreadingFileList();
                if (window.updateProofreadingPrompt) window.updateProofreadingPrompt();

                // 常用外漢字検出
                setTimeout(function () {
                    try {
                        if (window.state && window.state.proofreadingFiles && window.state.proofreadingFiles.length > 0
                            && window.detectNonJoyoLinesWithPageInfo && window.showNonJoyoResultPopup) {
                            var detected = window.detectNonJoyoLinesWithPageInfo(window.state.proofreadingFiles);
                            window.state.proofreadingDetectedNonJoyoWords = detected;
                            window.showNonJoyoResultPopup(detected, true);
                        }
                    } catch (e) { /* ignore */ }
                }, 300);
            } else {
                if (main) main.style.display = 'flex';
                if (window.state) window.state.currentViewMode = 'edit';
                if (mode === 'formatting' && window.selectDataType) window.selectDataType('txt_only');
                if (window.updateTxtUploadStatus) window.updateTxtUploadStatus();
                if (window.renderTable) window.renderTable();
                if (window.showEditMode) window.showEditMode();
                if (window.renderSymbolTable) window.renderSymbolTable();
                if (window.generateXML) window.generateXML();
            }
            var geminiBtn = document.getElementById('extractionGeminiBtn');
            if (geminiBtn) geminiBtn.removeAttribute('disabled');
            if (window.enableDataTypeToggle) window.enableDataTypeToggle();
        } catch (e) { console.warn('[ProGen] Navigate error:', e); }
    }

    // メイン処理: ハンドオフ読み込み → JSON読み込み → モード遷移
    readHandoff().then(function (data) {
        if (data) applyHandoff(data);

        var jsonPath = data ? data.jsonPath : '';
        if (jsonPath && window.electronAPI && window.electronAPI.readJsonFile) {
            window.electronAPI.readJsonFile(jsonPath).then(function (result) {
                try {
                    if (result && result.success !== false && window.processLoadedJson) {
                        var fn = jsonPath.split('\\').pop() || jsonPath.split('/').pop() || '';
                        window.processLoadedJson(result, fn).then(function () {
                            if (landing) landing.style.display = 'none';
                            if (mode === 'proofreading' && main) main.style.display = 'none';
                            navigateToMode();
                        }).catch(function () { navigateToMode(); });
                    } else {
                        navigateToMode();
                    }
                } catch (e) { navigateToMode(); }
            }).catch(function () { navigateToMode(); });
        } else {
            navigateToMode();
        }
    }).catch(function () {
        navigateToMode();
    });
})();
