// Parser simple por keywords (intercambiable mañana por Gemini)

export function parseKeywordsToAction(text) {
  const t = (text || '').toLowerCase();

  // device
  const wantsLuz = /\bluz\b|foco|lampara|bombilla|ilumin/.test(t);
  const wantsAire = /\b(aire|ventilador)\b|ac|acond|cool|hel(a|a)r/.test(t);

  // accion
  const wantsTurnOn = /\b(enciende|enciend(a|es)|prende|prendo|prendam|prendida|prender|encender)\b|\bon\b|\blight\b/.test(t);
  const wantsTurnOff = /\b(apaga|apagad[oa]?|apagar|apagues|apagad(a|os)|off)\b/.test(t);

  // Alternativas por contexto
  if (/oscuro|no veo|noche|penumbra/.test(t)) {
    return { action: 'turn_on', device: 'luz' };
  }

  if (/calor|bochorno|sofoc|sudando|me derrito|pesado/.test(t)) {
    return { action: 'turn_on', device: 'aire' };
  }

  if (/fr[ií]o|tengo fr[ií]o|me muero de fr[ií]o/.test(t)) {
    return { action: 'turn_off', device: 'aire' };
  }

  if (wantsLuz && wantsTurnOn) return { action: 'turn_on', device: 'luz' };
  if (wantsLuz && wantsTurnOff) return { action: 'turn_off', device: 'luz' };

  if (wantsAire && wantsTurnOn) return { action: 'turn_on', device: 'aire' };
  if (wantsAire && wantsTurnOff) return { action: 'turn_off', device: 'aire' };

  return null;
}

