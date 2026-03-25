// tauri-bridge.js
// Electron の preload.js (window.electronAPI) を Tauri の invoke で再現するブリッジ層
// COMIC-Bridge統合版: 全コマンドに progen_ プレフィックスを付与
// iframe内でも動作するように window.__TAURI__ のフォールバックを実装

(function () {
    // iframe内の場合はparentの__TAURI__にフォールバック
    const TAURI = window.__TAURI__ || (window.parent && window.parent.__TAURI__);
    if (!TAURI) {
        console.error('[ProGen] Tauri API not available');
        return;
    }

    const { invoke, convertFileSrc } = TAURI.core;
    const { listen } = TAURI.event;

    // asset://プロトコルでローカルファイルをimgのsrcに使える
    window.convertFileSrc = convertFileSrc;

    window.electronAPI = {
        // Electron環境フラグ（互換性のため true を維持）
        isElectron: true,

        // プラットフォーム情報
        platform: 'win32',

        // JSONフォルダのベースパスを取得
        getJsonFolderPath: () => invoke('progen_get_json_folder_path'),

        // フォルダ内の一覧を取得
        listDirectory: (dirPath) => invoke('progen_list_directory', { dirPath: dirPath || null }),

        // JSONファイルを読み込み
        readJsonFile: (filePath) => invoke('progen_read_json_file', { filePath }),

        // JSONファイルを書き込み
        writeJsonFile: (filePath, data) => invoke('progen_write_json_file', { filePath, data }),

        // マスタールールJSONを読み込み
        readMasterRule: (labelValue) => invoke('progen_read_master_rule', { labelValue }),

        // マスタールールJSONをGドライブに書き込み
        writeMasterRule: (labelValue, data) => invoke('progen_write_master_rule', { labelValue, data }),

        // 新規レーベルを作成
        createMasterLabel: (labelKey, displayName) => invoke('progen_create_master_label', { labelKey, displayName }),

        // マスタールールのレーベル一覧を取得
        getMasterLabelList: () => invoke('progen_get_master_label_list'),

        // 校正テキストログ側に作品フォルダを作成
        createTxtWorkFolder: (label, work) => invoke('progen_create_txt_work_folder', { label, work }),

        // TXTフォルダのベースパスを取得
        getTxtFolderPath: () => invoke('progen_get_txt_folder_path'),

        // TXTフォルダ内の一覧を取得
        listTxtDirectory: (dirPath) => invoke('progen_list_txt_directory', { dirPath: dirPath || null }),

        // TXTファイルを読み込み
        readTxtFile: (filePath) => invoke('progen_read_txt_file', { filePath }),

        // テキストファイルを指定パスに保存
        writeTextFile: (filePath, content) => invoke('progen_write_text_file', { filePath, content }),

        // テキストファイル保存ダイアログを表示
        showSaveTextDialog: (defaultName) => invoke('progen_show_save_text_dialog', { defaultName: defaultName || null }),

        // 仕様書PDF出力
        printToPDF: (htmlContent) => invoke('progen_print_to_pdf', { htmlContent }),

        // 校正チェックデータを保存
        saveCalibrationData: (params) => invoke('progen_save_calibration_data', { params }),

        // COMIC-Bridgeを起動（統合版ではself=既に同一アプリ内）
        launchComicBridge: (jsonFilePath) => invoke('progen_launch_comic_bridge', { jsonFilePath }),

        // COMIC-POTハンドオフ受信（push通知）
        onComicPotHandoff: (callback) => {
            listen('comicpot-handoff', (event) => callback(event.payload));
        },

        // COMIC-POTハンドオフデータを要求（pull型）
        getComicPotHandoff: () => invoke('progen_get_comicpot_handoff'),

        // 画像ビューアー
        showOpenImageFolderDialog: () => invoke('progen_show_open_image_folder_dialog'),
        listImageFiles: (dirPath) => invoke('progen_list_image_files', { dirPath }),
        listImageFilesFromPaths: (paths) => invoke('progen_list_image_files_from_paths', { paths }),
        loadImagePreview: (filePath, maxSize) => invoke('progen_load_image_preview', { filePath, maxSize: maxSize || 1600 }),

        // D&Dで落とされたTXTファイルをパスから読み込み
        readDroppedTxtFiles: (paths) => invoke('progen_read_dropped_txt_files', { paths }),

        // 校正結果JSONファイルを開いて読む
        openAndReadJsonDialog: () => invoke('progen_open_and_read_json_dialog'),
        // 校正結果JSONファイル保存ダイアログ
        showSaveJsonDialog: (defaultName) => invoke('progen_show_save_json_dialog', { defaultName: defaultName || null }),
    };

    // ===== グローバル Tauri D&D イベントリスナー =====
    const _dragDropHandlers = [];

    window._registerDragDropHandler = function (handler) {
        _dragDropHandlers.push(handler);
    };

    // Tauri 2 の onDragDropEvent API を使用
    try {
        const { getCurrentWindow } = TAURI.window;
        const currentWindow = getCurrentWindow();

        currentWindow.onDragDropEvent((event) => {
            const payload = event.payload;

            if (payload.type === 'enter' || payload.type === 'over') {
                document.dispatchEvent(new CustomEvent('tauri-drag-enter'));
            } else if (payload.type === 'leave') {
                document.dispatchEvent(new CustomEvent('tauri-drag-leave'));
            } else if (payload.type === 'drop') {
                document.dispatchEvent(new CustomEvent('tauri-drag-leave'));
                const paths = payload.paths || [];
                if (paths.length === 0) return;
                for (const handler of _dragDropHandlers) {
                    if (handler(paths)) return;
                }
            }
        });
    } catch (e) {
        console.warn('[ProGen] D&D event setup failed (iframe context):', e.message);
    }

    // 外部リンクをデフォルトブラウザで開く
    const originalOpen = window.open;
    window.open = function (url, target, features) {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            // opener プラグインの代わりに shell open を使用
            try {
                if (TAURI.opener && TAURI.opener.openUrl) {
                    TAURI.opener.openUrl(url);
                } else {
                    // フォールバック: 親ウィンドウのopenerを試す
                    invoke('open_with_default_app', { filePath: url }).catch(() => {
                        originalOpen.call(window, url, target, features);
                    });
                }
            } catch (e) {
                originalOpen.call(window, url, target, features);
            }
            return null;
        }
        return originalOpen.call(window, url, target, features);
    };
})();
