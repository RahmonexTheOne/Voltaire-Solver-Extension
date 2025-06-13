console.log("Content script loaded and running.");

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this; 
    clearTimeout(timeout); 
    timeout = setTimeout(() => func.apply(context, args), wait); 
  };
}

function displayCorrection(sentenceElement, text, corrections) {
  if (!Array.isArray(corrections)) { 
    console.error('Expected corrections to be an array, received:', corrections);
    return;
  }

  console.log('Corrections:', corrections);
  corrections.sort((a, b) => a.offset - b.offset); 
  corrections.forEach(correction => {
    const { offset, length } = correction;
    console.log('Processing error at offset:', offset, 'with length:', length);

    let currentLength = 0;
    let done = false;

    function processNode(node) {
      if (done) return; 
      if (node.nodeType === Node.TEXT_NODE) { 
        const nodeLength = node.textContent.length;
        if (currentLength + nodeLength > offset && !done) {
          const positionInNode = offset - currentLength; 
          const range = document.createRange(); 
          range.setStart(node, positionInNode);
          range.setEnd(node, positionInNode);

          const dotSpan = document.createElement('span'); 
          dotSpan.textContent = ',';
          dotSpan.style.color = '#f5f5f5';
          dotSpan.style.opacity = '1';
          range.insertNode(dotSpan); 

          done = true; 
          return;
        }
        currentLength += nodeLength; 
      } else if (node.hasChildNodes()) {
        Array.from(node.childNodes).forEach(processNode); 
      }
    }

    processNode(sentenceElement); 
    if (!done) {
      console.log('Error: Position for error not found in text nodes.'); 
    }
  });
}

// Ajouter les patterns personnalisés aux résultats de LanguageTool
function findCommonFrenchErrors(text) {
  const patterns = [
    // "quoique" vs "quoi que"
    { regex: /\bquoique\s+ce\s+soit\b/gi, type: 'quoique ce soit → quoi que ce soit' },
    { regex: /\bquoique\s+(?:vous|tu|il|elle|on|nous|ils|elles|j'|l')\s+\w+(?:e|es|ent|ions|iez)\b/gi, type: 'quoique → quoi que (en deux mots)' },
    
    // "voir" vs "voire"
    { regex: /,\s+voir\s+(?:\w+\s+)?(?:soir|matin|demain|hier|aujourd'hui|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi)\b/gi, type: 'voir → voire (et même)' },
    { regex: /\bvoir\s+(?:même|plus|davantage|mieux|pire|pis)\b/gi, type: 'voir → voire (et même)' },
    
    // Traits d'union avec inversion
    { regex: /\b\w+[aeiou]\s+t[''](?:il|elle|on)\b/gi, type: 'trait d\'union requis (verbe-t-pronom)' },
    { regex: /\b(?:comment|pourquoi|quand|où|que)\s+\w+\s+(?:il|elle|on|ils|elles|vous|tu)\b/gi, type: 'trait d\'union question inversion' },
    
    // Futur vs Conditionnel - verbes irréguliers
    { regex: /\bje\s+(?:crois|pense|suppose|imagine)\s+que\s+j'(?:aurai|serai|irai|ferai|dirai|saurai|pourrai|voudrai|devrai)\b/gi, type: 'conditionnel requis après opinion' },
    { regex: /\bj'aurai\s+(?:mieux|plutôt|peut-être|probablement|dû|pu|voulu|aimé)\b/gi, type: 'conditionnel requis (j\'aurais)' },
    
    // Conditionnel vs Futur - règles générales
    { regex: /\bje\s+\w+ai\s+(?:que|bien|volontiers)\b/gi, type: 'conditionnel requis - politesse (ajouter S)' },
    { regex: /\b(?:demain|bientôt|plus\s+tard|la\s+prochaine\s+fois|ce\s+sera),?\s+je\s+\w+ais\b/gi, type: 'futur requis - certitude (enlever S)' },
    
    // Négations avec élision manquante
    { regex: /\bon\s+y\s+(?:va|allait|ira|irait|est|était|sera|serait|a|avait|aura|aurait)\b/gi, type: 'négation manquante (on n\'y)' },
    { regex: /\bon\s+en\s+(?:a|avait|aura|aurait|est|était|sera|serait|va|allait|ira|irait)\b/gi, type: 'négation manquante (on n\'en)' },
    
    // "fait" + infinitive - erreurs
    { regex: /\b(?:ont|avons|avez|as|a)\s+faits\s+(?:dire|faire|voir|savoir|comprendre|entendre|laisser|venir|partir|aller|sortir|entrer|monter|descendre)\b/gi, type: 'fait + infinitif (doit être invariable)' },
    { regex: /\bse\s+(?:sont|sommes|êtes)\s+faits\s+(?:dire|faire|voir|savoir|comprendre|entendre|laisser|venir|partir|aller|sortir|entrer|monter|descendre)\b/gi, type: 'se fait + infinitif (doit être invariable)' },
    
    // Accords participes passés
    { regex: /\b(?:la|cette|une)\s+\w+\s+(?:que|qu[''])\s+\w+\s+(?:ont|avons|avez|as|a)\s+(?:reçu|vu|pris|mis|fait|dit|écrit|lu|su|pu|voulu|dû)(?![se])\b/gi, type: 'accord participe passé (COD féminin avant)' },
    
    // Adjectifs
    { regex: /\b(?:une|la)\s+\w*\s+inclue\b/gi, type: 'accord adjectif féminin (incluse)' },
    
    // Orthographe courante
    { regex: /\bparmis\b/gi, type: 'orthographe (parmi)' },
    { regex: /\bmalgres\b/gi, type: 'orthographe (malgré)' },
    { regex: /\bbiensur\b/gi, type: 'orthographe (bien sûr)' },
    { regex: /\bpeutetre\b/gi, type: 'orthographe (peut-être)' }
  ];
  
  const matches = [];
  patterns.forEach(pattern => {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        offset: match.index,
        length: match[0].length,
        rule: { category: { id: 'CUSTOM_PATTERN' } },
        message: `Erreur: ${pattern.type}`
      });
    }
  });
  
  return matches;
}

function checkAndDisplayCorrections(sentenceElement) {
  const text = sentenceElement.innerText; 
  
  // 1. Appel LanguageTool (ton code original)
  fetch(`https://api.languagetool.org/v2/check?language=fr&text=${encodeURIComponent(text)}`, {
    method: 'POST' 
  })
  .then(response => response.json())
  .then(data => {
    console.log('API Response:', data);
    
    let allMatches = [];
    
    // 2. Ajouter les matches de LanguageTool
    if (data.matches && Array.isArray(data.matches)) {
      allMatches.push(...data.matches);
    }
    
    // 3. Ajouter tes patterns personnalisés
    const customMatches = findCommonFrenchErrors(text);
    allMatches.push(...customMatches);
    
    console.log('Total matches:', allMatches.length);
    
    if (allMatches.length > 0) {
      displayCorrection(sentenceElement, text, allMatches); 
    } else {
      console.log('No errors found'); 
    }
  })
  .catch(error => {
    console.error('Error:', error); 
  });
}

const debouncedCheckAndDisplayCorrections = debounce(checkAndDisplayCorrections, 500);

function initMutationObserver() {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.classList.contains('sentence')) { 
            debouncedCheckAndDisplayCorrections(node);
          }
          node.querySelectorAll('.sentence').forEach(sentenceElement => {
            debouncedCheckAndDisplayCorrections(sentenceElement); 
          });
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true }); 
}

initMutationObserver();