// Parser simple por keywords (intercambiable mañana por Gemini)

export function parseKeywordsToAction(text) {
  const t = (text || '').toLowerCase();

  // device (incluye nuevos simuladores)
  const wantsLuz = /\bluz\b|foco|lampara|bombilla|ilumin/.test(t);
  const wantsAire = /\b(aire|ventilador)\b|ac|acond|cool|hel(a|a)r/.test(t);

  const wantsCalor = /\b(calor|bochorno|sofoc|sudando|me derrito|pesado)\b/.test(t);
  const wantsFrio = /\b(fr[ií]o|tengo fr[ií]o|me muero de fr[ií]o|hel(a|a)da)\b/.test(t);

  const wantsSequedad = /\b(seco|sequedad|sequ[ií]a|aire seco)\b/.test(t);
  const wantsHumedad = /\b(humedad|mojado|humedo|humeda)\b/.test(t);

  const wantsRiego = /\b(riego|regar|regado|riego autom[aá]tico)\b/.test(t);

  // accion genérica
  const wantsTurnOn = /\b(enciende|enciend(a|es)|prende|prendo|prendam|prendida|prender|encender|activar|subir)\b|\bon\b|\blight\b/.test(t);
  const wantsTurnOff = /\b(apaga|apagad[oa]?|apagar|apagues|apagad(a|os)|off|desactivar|bajar|baja|seca)\b/.test(t);

  // Alternativas por contexto (existente)
  if (/oscuro|no veo|noche|penumbra/.test(t)) {
    return { action: 'turn_on', device: 'luz' };
  }

  if (wantsCalor) {
    return { action: 'turn_on', device: 'aire' };
  }

  if (wantsFrio) {
    return { action: 'turn_off', device: 'aire' };
  }

  // Luz
  if (wantsLuz && wantsTurnOn) return { action: 'turn_on', device: 'luz' };
  if (wantsLuz && wantsTurnOff) return { action: 'turn_off', device: 'luz' };

  // Aire (conserva lógica anterior)
  if (wantsAire && wantsTurnOn) return { action: 'turn_on', device: 'aire' };
  if (wantsAire && wantsTurnOff) return { action: 'turn_off', device: 'aire' };

  // 🌡️ Temperatura (simulación)
  if (/(activar|encender|subir)/.test(t) && /calor|temperatura/.test(t)) {
    return { action: 'turn_on', device: 'temperatura_c' };
  }
  if (/(desactivar|apagar|bajar)/.test(t) && /calor|temperatura/.test(t)) {
    return { action: 'turn_off', device: 'temperatura_c' };
  }

  // 💧 Humedad (simulación)
  if (wantsSequedad && (wantsTurnOn || /activar|encender|bajar|baja/.test(t))) {
    return { action: 'turn_on', device: 'humedad_pct' };
  }
  if (wantsHumedad && (wantsTurnOff || /desactivar|apagar|subir|suba/.test(t))) {
    return { action: 'turn_off', device: 'humedad_pct' };
  }

  // 💦 Riego (simulación)
  if (wantsRiego && (wantsTurnOn || /regar|activar|encender/.test(t))) {
    return { action: 'turn_on', device: 'riego' };
  }
  if (wantsRiego && (wantsTurnOff || /desactivar|apagar|parar|off/.test(t))) {
    return { action: 'turn_off', device: 'riego' };
  }

  return null;
}


