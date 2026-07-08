"""
teclados.py — Paneles de botones inline para el bot de Telegram.

Teclado toggle: cada dispositivo muestra solo el botón de la ACCIÓN OPUESTA
al estado actual. Si la luz está encendida → muestra "Apagar Luz"; si está
apagada → muestra "Encender Luz". Lo mismo para el aire/ventilador.

El estado se guarda por chat_id en un diccionario en memoria (RAM).
En producción: persistir en SQLite/Redis si se quiere histórico.
"""

# ============================================================
# Detección de librería
# ============================================================
try:
    from telebot import types as tb_types
    _LIB = "telebot"
except ImportError:
    tb_types = None
    _LIB = None

if _LIB is None:
    try:
        from telegram import InlineKeyboardMarkup, InlineKeyboardButton
        _LIB = "python-telegram-bot"
    except ImportError:
        _LIB = None


# ============================================================
# Callback data (constantes compartidas)
# ============================================================
CB_LUZ_TOGGLE = "luz_toggle"      # un solo botón para luz (cambia por estado)
CB_AIRE_TOGGLE = "aire_toggle"    # un solo botón para aire (cambia por estado)
CB_CREADOR = "creador_info"        # ya no se muestra en el panel


# ============================================================
# Estado por chat (en memoria)
# ============================================================
# estructura: { chat_id: { "luz": bool, "aire": bool } }
_estado_chats: dict[int, dict[str, bool]] = {}


def obtener_estado(chat_id: int) -> dict:
    """Devuelve el estado del chat. Inicializa si no existe (todo apagado)."""
    if chat_id not in _estado_chats:
        _estado_chats[chat_id] = {"luz": False, "aire": False}
    return _estado_chats[chat_id]


def alternar_dispositivo(chat_id: int, dispositivo: str) -> bool:
    """
    Cambia el estado de un dispositivo y devuelve el NUEVO estado.
    dispositivo ∈ {"luz", "aire"}.
    """
    estado = obtener_estado(chat_id)
    estado[dispositivo] = not estado[dispositivo]
    return estado[dispositivo]


# ============================================================
# Helpers internos para construir filas
# ============================================================
def _fila_luz(chat_id: int):
    """Fila con UN botón: muestra la acción opuesta al estado actual de la luz."""
    encendida = obtener_estado(chat_id)["luz"]
    texto = "🔌 Apagar Luz" if encendida else "💡 Encender Luz"
    return texto, CB_LUZ_TOGGLE


def _fila_aire(chat_id: int):
    """Fila con UN botón: muestra la acción opuesta al estado actual del aire."""
    encendido = obtener_estado(chat_id)["aire"]
    texto = "🌬️ Apagar Aire" if encendido else "❄️ Encender Aire"
    return texto, CB_AIRE_TOGGLE


# ============================================================
# Constructor del panel (toggle dinámico)
# ============================================================
def obtener_teclado_domotica(chat_id: int | None = None):
    """
    Devuelve el teclado inline. Si se pasa chat_id, los botones reflejan
    el estado actual (mostrando la acción opuesta disponible).
    Si chat_id es None, devuelve el panel por defecto (luz y aire apagados).
    """
    if chat_id is None:
        chat_id = 0

    texto_luz, cb_luz = _fila_luz(chat_id)
    texto_aire, cb_aire = _fila_aire(chat_id)

    # Estructura común (filas con un botón cada una)
    filas = [
        [{"text": texto_luz, "callback_data": cb_luz}],
        [{"text": texto_aire, "callback_data": cb_aire}],
    ]

    if _LIB == "telebot" and tb_types is not None:
        markup = tb_types.InlineKeyboardMarkup(row_width=1)
        markup.add(tb_types.InlineKeyboardButton(texto_luz, callback_data=cb_luz))
        markup.add(tb_types.InlineKeyboardButton(texto_aire, callback_data=cb_aire))
        return markup

    if _LIB == "python-telegram-bot":
        return InlineKeyboardMarkup([
            [InlineKeyboardButton(texto_luz, callback_data=cb_luz)],
            [InlineKeyboardButton(texto_aire, callback_data=cb_aire)],
        ])

    # Fallback dict neutro
    return {"inline_keyboard": filas}


# ============================================================
# Mapa callback_data → texto que se inyecta al LLM como si fuera
# un mensaje natural del usuario.
# ============================================================
def callback_a_texto(callback_data: str, chat_id: int) -> str | None:
    """
    Devuelve el texto equivalente al callback, según el estado actual del chat
    (para que la IA emita la etiqueta correcta de encendido o apagado).
    """
    if callback_data == CB_LUZ_TOGGLE:
        encendida = obtener_estado(chat_id)["luz"]
        # Mostramos el botón de la acción opuesta; por tanto la acción a ejecutar
        # es la del estado actual invertido: si estaba apagada, ENCENDER; si estaba encendida, APAGAR.
        return "enciende la luz" if not encendida else "apaga la luz"

    if callback_data == CB_AIRE_TOGGLE:
        encendido = obtener_estado(chat_id)["aire"]
        return "enciende el ventilador" if not encendido else "apaga el ventilador"

    return None