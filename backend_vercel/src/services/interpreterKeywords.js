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

  // helper: explícito ON/OFF por palabras
  const wantsOffWords = /\b(apaga|apagar|desactivar|off|baja|bajar|seca|cierra|deten|stop)\b/.test(t);
  const wantsOnWords = /\b(enciende|encender|activar|on|prende|prender|subir|abre|start|activar)\b/.test(t);


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

  // 🌡️ Temperatura (simulación): aceptar frases con encender/apagar o activar/desactivar
  if (/calor|temperatura/.test(t)) {
    if (wantsOnWords || wantsTurnOn || /activar|encender|subir/.test(t)) {
      return { action: 'turn_on', device: 'temperatura_c' };
    }
    if (wantsOffWords || wantsTurnOff || /desactivar|apagar|bajar/.test(t)) {
      return { action: 'turn_off', device: 'temperatura_c' };
    }
  }

  // 💧 Humedad: aquí se usa el device "humedad_pct" para modo seco (sequedad)
  // Soporta tanto "sequedad" como mensajes con "humedad".
  if (wantsSequedad) {
    if (wantsOnWords || wantsTurnOn) return { action: 'turn_on', device: 'humedad_pct' };
    if (wantsOffWords || wantsTurnOff) return { action: 'turn_off', device: 'humedad_pct' };
  }
  if (wantsHumedad) {
    // si piden "humedad" con un verbo de apagar/desactivar, interpretamos como fin del modo seco
    if (wantsOffWords || wantsTurnOff) return { action: 'turn_off', device: 'humedad_pct' };
    if (wantsOnWords || wantsTurnOn) return { action: 'turn_on', device: 'humedad_pct' };
  }

  // 💦 Riego (simulación)
  if (wantsRiego) {
    if (wantsOnWords || wantsTurnOn) return { action: 'turn_on', device: 'riego' };
    if (wantsOffWords || wantsTurnOff) return { action: 'turn_off', device: 'riego' };
  }


  return null;
}


