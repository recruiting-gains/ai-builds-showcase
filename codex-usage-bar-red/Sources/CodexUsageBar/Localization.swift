import Foundation

enum AppLanguage: String, CaseIterable, Identifiable, Sendable {
    case system
    case zhHans = "zh-Hans"
    case zhHant = "zh-Hant"
    case english = "en"
    case japanese = "ja"
    case korean = "ko"
    case spanish = "es"

    var id: String { rawValue }

    var nativeName: String {
        switch self {
        case .system: return "System Default"
        case .zhHans: return "简体中文"
        case .zhHant: return "繁體中文"
        case .english: return "English"
        case .japanese: return "日本語"
        case .korean: return "한국어"
        case .spanish: return "Español"
        }
    }

    var resolved: AppLanguage {
        guard self == .system else { return self }
        let preferred = Locale.preferredLanguages.first?.lowercased() ?? "en"
        if preferred.hasPrefix("zh-hant") || preferred.hasPrefix("zh-tw") ||
            preferred.hasPrefix("zh-hk") || preferred.hasPrefix("zh-mo") {
            return .zhHant
        }
        if preferred.hasPrefix("zh") { return .zhHans }
        if preferred.hasPrefix("ja") { return .japanese }
        if preferred.hasPrefix("ko") { return .korean }
        if preferred.hasPrefix("es") { return .spanish }
        return .english
    }

    var locale: Locale {
        switch resolved {
        case .zhHans: return Locale(identifier: "zh_CN")
        case .zhHant: return Locale(identifier: "zh_TW")
        case .japanese: return Locale(identifier: "ja_JP")
        case .korean: return Locale(identifier: "ko_KR")
        case .spanish: return Locale(identifier: "es_ES")
        case .system, .english: return Locale(identifier: "en_US")
        }
    }
}

enum L10n {
    static func string(_ key: String, language: AppLanguage) -> String {
        let resolved = language.resolved
        return tables[resolved]?[key] ?? tables[.english]?[key] ?? key
    }

    static func format(_ key: String, language: AppLanguage, _ arguments: CVarArg...) -> String {
        String(format: string(key, language: language), locale: language.locale, arguments: arguments)
    }

    private static let tables: [AppLanguage: [String: String]] = [
        .zhHans: [
            "system_default": "跟随系统", "settings": "设置", "quit": "退出",
            "loading_account": "正在读取账户…", "five_hour_quota": "5 小时额度", "weekly_quota": "每周额度",
            "remaining": "%d%% 剩余", "unavailable": "不可用", "reset_at": "重置：%@", "updated_at": "更新于 %@",
            "credits_unlimited": "积分无限", "credits_balance": "积分 %@", "credits_unavailable": "无积分信息",
            "reset_count": "%d 次重置", "refresh": "刷新", "official_usage": "官方 Usage",
            "section_language": "语言", "language": "应用语言", "section_menu_bar": "菜单栏", "icon": "图标",
            "icon_size": "图标大小", "text_size": "文字字号", "section_general": "通用",
            "launch_at_login": "登录时自动启动", "show_touch_bar": "显示 Usage 信息",
            "auto_touch_bar": "Codex 前台时自动显示", "touch_bar_description": "显示 5 小时与每周额度、进度和重置时间。",
            "touch_bar_unavailable": "当前系统不支持前台常驻；本应用激活时仍可显示。",
            "settings_window_title": "Codex Usage Bar 设置", "five_hour_short": "5 小时", "weekly_short": "每周",
            "weekly_prefix": "周", "loading_reset": "正在读取重置时间…", "reset_customization": "Codex 重置时间",
            "refresh_usage": "刷新 Usage", "refresh_codex_usage": "刷新 Codex Usage", "quota_customization": "Codex %@额度",
            "touch_bar_reset": "重置 5h %@ · 周 %@", "loading_usage": "正在读取 Usage…", "usage_unavailable": "Usage 暂不可用",
            "error_codex_not_found": "找不到 Codex CLI。请先安装或更新 ChatGPT/Codex。",
            "error_launch_failed": "无法启动 Codex：%@", "error_timeout": "读取超时，请稍后重试。",
            "error_invalid_response": "Codex 返回了无法识别的 Usage 数据。", "error_server": "Codex 返回错误：%@",
            "error_unknown": "未知错误", "error_launch_at_login": "无法更新开机启动设置：%@",
            "icon_gauge": "仪表盘", "icon_simple_gauge": "简洁仪表", "icon_speedometer": "速度表", "icon_bar_chart": "柱状图",
            "icon_trend": "趋势图", "icon_percent": "百分比", "icon_bolt": "闪电", "icon_flame": "火焰",
            "icon_sparkles": "星光", "icon_terminal": "终端", "icon_command": "Command", "icon_cpu": "处理器",
            "icon_chip": "芯片", "icon_timer": "计时器", "icon_refresh_clock": "刷新时钟", "icon_waveform": "状态波形", "icon_hidden": "隐藏图标"
        ],
        .zhHant: [
            "system_default": "跟隨系統", "settings": "設定", "quit": "結束",
            "loading_account": "正在讀取帳戶…", "five_hour_quota": "5 小時額度", "weekly_quota": "每週額度",
            "remaining": "剩餘 %d%%", "unavailable": "無法使用", "reset_at": "重置：%@", "updated_at": "更新於 %@",
            "credits_unlimited": "點數無限", "credits_balance": "點數 %@", "credits_unavailable": "無點數資訊",
            "reset_count": "%d 次重置", "refresh": "重新整理", "official_usage": "官方 Usage",
            "section_language": "語言", "language": "應用程式語言", "section_menu_bar": "選單列", "icon": "圖示",
            "icon_size": "圖示大小", "text_size": "文字大小", "section_general": "一般",
            "launch_at_login": "登入時自動啟動", "show_touch_bar": "顯示 Usage 資訊",
            "auto_touch_bar": "Codex 在前景時自動顯示", "touch_bar_description": "顯示 5 小時與每週額度、進度和重置時間。",
            "touch_bar_unavailable": "目前系統不支援前景常駐；啟用本應用程式時仍可顯示。",
            "settings_window_title": "Codex Usage Bar 設定", "five_hour_short": "5 小時", "weekly_short": "每週",
            "weekly_prefix": "週", "loading_reset": "正在讀取重置時間…", "reset_customization": "Codex 重置時間",
            "refresh_usage": "重新整理 Usage", "refresh_codex_usage": "重新整理 Codex Usage", "quota_customization": "Codex %@額度",
            "touch_bar_reset": "重置 5h %@ · 週 %@", "loading_usage": "正在讀取 Usage…", "usage_unavailable": "Usage 暫時無法使用",
            "error_codex_not_found": "找不到 Codex CLI。請先安裝或更新 ChatGPT/Codex。",
            "error_launch_failed": "無法啟動 Codex：%@", "error_timeout": "讀取逾時，請稍後再試。",
            "error_invalid_response": "Codex 傳回了無法識別的 Usage 資料。", "error_server": "Codex 傳回錯誤：%@",
            "error_unknown": "未知錯誤", "error_launch_at_login": "無法更新登入啟動設定：%@",
            "icon_gauge": "儀表板", "icon_simple_gauge": "簡潔儀表", "icon_speedometer": "速度表", "icon_bar_chart": "長條圖",
            "icon_trend": "趨勢圖", "icon_percent": "百分比", "icon_bolt": "閃電", "icon_flame": "火焰",
            "icon_sparkles": "星光", "icon_terminal": "終端機", "icon_command": "Command", "icon_cpu": "處理器",
            "icon_chip": "晶片", "icon_timer": "計時器", "icon_refresh_clock": "更新時鐘", "icon_waveform": "狀態波形", "icon_hidden": "隱藏圖示"
        ],
        .english: [
            "system_default": "System Default", "settings": "Settings", "quit": "Quit",
            "loading_account": "Loading account…", "five_hour_quota": "5-hour limit", "weekly_quota": "Weekly limit",
            "remaining": "%d%% remaining", "unavailable": "Unavailable", "reset_at": "Resets: %@", "updated_at": "Updated %@",
            "credits_unlimited": "Unlimited credits", "credits_balance": "Credits %@", "credits_unavailable": "No credit information",
            "reset_count": "%d resets", "refresh": "Refresh", "official_usage": "Official Usage",
            "section_language": "Language", "language": "App language", "section_menu_bar": "Menu Bar", "icon": "Icon",
            "icon_size": "Icon size", "text_size": "Text size", "section_general": "General",
            "launch_at_login": "Launch at login", "show_touch_bar": "Show Usage information",
            "auto_touch_bar": "Show automatically when Codex is active", "touch_bar_description": "Red bars show your actual allowances remaining and reset times. Missing windows are hidden. Stale readings are marked.",
            "touch_bar_unavailable": "Persistent display is unavailable on this system; it can still appear while this app is active.",
            "settings_window_title": "Codex Usage Bar Settings", "five_hour_short": "5 hour", "weekly_short": "Weekly",
            "weekly_prefix": "Wk", "loading_reset": "Loading reset times…", "reset_customization": "Codex reset times",
            "refresh_usage": "Refresh Usage", "refresh_codex_usage": "Refresh Codex Usage", "quota_customization": "Codex %@ limit",
            "touch_bar_reset": "Reset 5h %@ · Wk %@", "loading_usage": "Loading Usage…", "usage_unavailable": "Usage unavailable",
            "error_codex_not_found": "Codex CLI was not found. Install or update ChatGPT/Codex first.",
            "error_launch_failed": "Could not start Codex: %@", "error_timeout": "The request timed out. Try again later.",
            "error_invalid_response": "Codex returned unrecognized Usage data.", "error_server": "Codex returned an error: %@",
            "error_unknown": "Unknown error", "error_launch_at_login": "Could not update the launch-at-login setting: %@",
            "icon_gauge": "Gauge", "icon_simple_gauge": "Simple Gauge", "icon_speedometer": "Speedometer", "icon_bar_chart": "Bar Chart",
            "icon_trend": "Trend", "icon_percent": "Percentage", "icon_bolt": "Bolt", "icon_flame": "Flame",
            "icon_sparkles": "Sparkles", "icon_terminal": "Terminal", "icon_command": "Command", "icon_cpu": "Processor",
            "icon_chip": "Chip", "icon_timer": "Timer", "icon_refresh_clock": "Refresh Clock", "icon_waveform": "Status Waveform", "icon_hidden": "Hide Icon"
        ],
        .japanese: [
            "system_default": "システム設定に従う", "settings": "設定", "quit": "終了",
            "loading_account": "アカウントを読み込み中…", "five_hour_quota": "5時間の上限", "weekly_quota": "週間上限",
            "remaining": "残り %d%%", "unavailable": "利用不可", "reset_at": "リセット：%@", "updated_at": "更新：%@",
            "credits_unlimited": "クレジット無制限", "credits_balance": "クレジット %@", "credits_unavailable": "クレジット情報なし",
            "reset_count": "%d 回リセット", "refresh": "更新", "official_usage": "公式 Usage",
            "section_language": "言語", "language": "アプリの言語", "section_menu_bar": "メニューバー", "icon": "アイコン",
            "icon_size": "アイコンサイズ", "text_size": "文字サイズ", "section_general": "一般",
            "launch_at_login": "ログイン時に起動", "show_touch_bar": "Usage 情報を表示",
            "auto_touch_bar": "Codex が前面のとき自動表示", "touch_bar_description": "5時間と週間の上限、進捗、リセット時刻を表示します。",
            "touch_bar_unavailable": "このシステムでは常時表示できませんが、本アプリの使用中は表示できます。",
            "settings_window_title": "Codex Usage Bar 設定", "five_hour_short": "5時間", "weekly_short": "週間",
            "weekly_prefix": "週", "loading_reset": "リセット時刻を読み込み中…", "reset_customization": "Codex リセット時刻",
            "refresh_usage": "Usage を更新", "refresh_codex_usage": "Codex Usage を更新", "quota_customization": "Codex %@上限",
            "touch_bar_reset": "リセット 5h %@・週 %@", "loading_usage": "Usage を読み込み中…", "usage_unavailable": "Usage を利用できません",
            "error_codex_not_found": "Codex CLI が見つかりません。ChatGPT/Codex をインストールまたは更新してください。",
            "error_launch_failed": "Codex を起動できません：%@", "error_timeout": "読み込みがタイムアウトしました。後でもう一度お試しください。",
            "error_invalid_response": "Codex から認識できない Usage データが返されました。", "error_server": "Codex エラー：%@",
            "error_unknown": "不明なエラー", "error_launch_at_login": "ログイン時起動の設定を更新できません：%@",
            "icon_gauge": "ゲージ", "icon_simple_gauge": "シンプルゲージ", "icon_speedometer": "速度計", "icon_bar_chart": "棒グラフ",
            "icon_trend": "トレンド", "icon_percent": "パーセント", "icon_bolt": "稲妻", "icon_flame": "炎",
            "icon_sparkles": "きらめき", "icon_terminal": "ターミナル", "icon_command": "Command", "icon_cpu": "プロセッサ",
            "icon_chip": "チップ", "icon_timer": "タイマー", "icon_refresh_clock": "更新時計", "icon_waveform": "ステータス波形", "icon_hidden": "アイコンを非表示"
        ],
        .korean: [
            "system_default": "시스템 설정 따르기", "settings": "설정", "quit": "종료",
            "loading_account": "계정 불러오는 중…", "five_hour_quota": "5시간 한도", "weekly_quota": "주간 한도",
            "remaining": "%d%% 남음", "unavailable": "사용할 수 없음", "reset_at": "재설정: %@", "updated_at": "업데이트: %@",
            "credits_unlimited": "크레딧 무제한", "credits_balance": "크레딧 %@", "credits_unavailable": "크레딧 정보 없음",
            "reset_count": "%d회 재설정", "refresh": "새로 고침", "official_usage": "공식 Usage",
            "section_language": "언어", "language": "앱 언어", "section_menu_bar": "메뉴 막대", "icon": "아이콘",
            "icon_size": "아이콘 크기", "text_size": "텍스트 크기", "section_general": "일반",
            "launch_at_login": "로그인 시 실행", "show_touch_bar": "Usage 정보 표시",
            "auto_touch_bar": "Codex가 활성화되면 자동 표시", "touch_bar_description": "5시간 및 주간 한도, 진행률과 재설정 시간을 표시합니다.",
            "touch_bar_unavailable": "이 시스템에서는 상시 표시할 수 없지만 앱이 활성화된 동안에는 표시됩니다.",
            "settings_window_title": "Codex Usage Bar 설정", "five_hour_short": "5시간", "weekly_short": "주간",
            "weekly_prefix": "주", "loading_reset": "재설정 시간 불러오는 중…", "reset_customization": "Codex 재설정 시간",
            "refresh_usage": "Usage 새로 고침", "refresh_codex_usage": "Codex Usage 새로 고침", "quota_customization": "Codex %@ 한도",
            "touch_bar_reset": "재설정 5h %@ · 주 %@", "loading_usage": "Usage 불러오는 중…", "usage_unavailable": "Usage 사용 불가",
            "error_codex_not_found": "Codex CLI를 찾을 수 없습니다. ChatGPT/Codex를 설치하거나 업데이트하세요.",
            "error_launch_failed": "Codex를 실행할 수 없습니다: %@", "error_timeout": "요청 시간이 초과되었습니다. 나중에 다시 시도하세요.",
            "error_invalid_response": "Codex가 인식할 수 없는 Usage 데이터를 반환했습니다.", "error_server": "Codex 오류: %@",
            "error_unknown": "알 수 없는 오류", "error_launch_at_login": "로그인 시 실행 설정을 업데이트할 수 없습니다: %@",
            "icon_gauge": "게이지", "icon_simple_gauge": "간단한 게이지", "icon_speedometer": "속도계", "icon_bar_chart": "막대 차트",
            "icon_trend": "추세", "icon_percent": "백분율", "icon_bolt": "번개", "icon_flame": "불꽃",
            "icon_sparkles": "반짝임", "icon_terminal": "터미널", "icon_command": "Command", "icon_cpu": "프로세서",
            "icon_chip": "칩", "icon_timer": "타이머", "icon_refresh_clock": "새로 고침 시계", "icon_waveform": "상태 파형", "icon_hidden": "아이콘 숨기기"
        ],
        .spanish: [
            "system_default": "Según el sistema", "settings": "Ajustes", "quit": "Salir",
            "loading_account": "Cargando cuenta…", "five_hour_quota": "Límite de 5 horas", "weekly_quota": "Límite semanal",
            "remaining": "%d%% restante", "unavailable": "No disponible", "reset_at": "Se restablece: %@", "updated_at": "Actualizado %@",
            "credits_unlimited": "Créditos ilimitados", "credits_balance": "Créditos %@", "credits_unavailable": "Sin información de créditos",
            "reset_count": "%d restablecimientos", "refresh": "Actualizar", "official_usage": "Usage oficial",
            "section_language": "Idioma", "language": "Idioma de la app", "section_menu_bar": "Barra de menús", "icon": "Icono",
            "icon_size": "Tamaño del icono", "text_size": "Tamaño del texto", "section_general": "General",
            "launch_at_login": "Abrir al iniciar sesión", "show_touch_bar": "Mostrar información de Usage",
            "auto_touch_bar": "Mostrar al activar Codex", "touch_bar_description": "Muestra límites de 5 horas y semanales, progreso y horas de restablecimiento.",
            "touch_bar_unavailable": "La visualización permanente no está disponible; puede mostrarse mientras esta app esté activa.",
            "settings_window_title": "Ajustes de Codex Usage Bar", "five_hour_short": "5 horas", "weekly_short": "Semanal",
            "weekly_prefix": "Sem", "loading_reset": "Cargando restablecimientos…", "reset_customization": "Restablecimientos de Codex",
            "refresh_usage": "Actualizar Usage", "refresh_codex_usage": "Actualizar Codex Usage", "quota_customization": "Límite %@ de Codex",
            "touch_bar_reset": "Rest. 5h %@ · Sem %@", "loading_usage": "Cargando Usage…", "usage_unavailable": "Usage no disponible",
            "error_codex_not_found": "No se encontró Codex CLI. Instala o actualiza ChatGPT/Codex.",
            "error_launch_failed": "No se pudo iniciar Codex: %@", "error_timeout": "La solicitud agotó el tiempo. Inténtalo más tarde.",
            "error_invalid_response": "Codex devolvió datos de Usage no reconocidos.", "error_server": "Error de Codex: %@",
            "error_unknown": "Error desconocido", "error_launch_at_login": "No se pudo actualizar el inicio de sesión: %@",
            "icon_gauge": "Indicador", "icon_simple_gauge": "Indicador simple", "icon_speedometer": "Velocímetro", "icon_bar_chart": "Gráfico de barras",
            "icon_trend": "Tendencia", "icon_percent": "Porcentaje", "icon_bolt": "Rayo", "icon_flame": "Llama",
            "icon_sparkles": "Destellos", "icon_terminal": "Terminal", "icon_command": "Command", "icon_cpu": "Procesador",
            "icon_chip": "Chip", "icon_timer": "Temporizador", "icon_refresh_clock": "Reloj de actualización", "icon_waveform": "Onda de estado", "icon_hidden": "Ocultar icono"
        ]
    ]
}
