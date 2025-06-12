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
          dotSpan.style.color = '#fefefe';
          dotSpan.style.fontSize = '0.2em';
          dotSpan.style.opacity = '0.2';
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

// --------------------------------------
// Enhanced French Grammar Checking
// --------------------------------------
async function checkWithLanguageTool(text) {
  let allMatches = [];
  
  try {
    // First call: General French checking with all rules enabled
    const generalResponse = await fetch(`https://api.languagetool.org/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        language: 'fr',
        text: text,
        level: 'picky',
        // Enable ALL French rule categories
        enabledCategories: 'TYPOS,GRAMMAR,CONFUSED_WORDS,STYLE,PUNCTUATION,CASING,REDUNDANCY,SEMANTICS,MISC'
      })
    });
    
    const generalData = await generalResponse.json();
    if (generalData.matches) allMatches.push(...generalData.matches);

    // Second call: Specific French rules that are sometimes disabled by default
    const specificResponse = await fetch(`https://api.languagetool.org/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        language: 'fr',
        text: text,
        enabledRules: [
          'FRENCH_WHITESPACE',
          'AGREEMENT_PAST_PARTICIPLE', 
          'CONJUGAISON_VERBE',
          'ACCORD_VERBE',
          'ACCORD_ADJECTIF',
          'ACCORD_NOMBRE',
          'FRANCAIS_ORTHOGRAPHE',
          'CONFUSION_WORD',
          'ELISION',
          'HOMOPHONE_CONFUSION',
          'APOSTROPHE_TYPOGRAPHIQUE',
          'ACCORD_PARTICIPE_PASSE',
          'SUBJONCTIF_PRESENT',
          'BARBARISM_FRENCH',
          'FRENCH_WORD_COHERENCY'
        ].join(',')
      })
    });
    
    const specificData = await specificResponse.json();
    if (specificData.matches) allMatches.push(...specificData.matches);

  } catch (error) {
    console.error('LanguageTool error:', error);
  }
  
  return allMatches;
}

function findCommonFrenchErrors(text) {
  const patterns = [
    // Conditionnel vs Futur - 1ère personne du singulier
    { regex: /\bje\s+souhaiterai\b/gi, type: 'conditionnel vs futur (souhaiterais)' },
    { regex: /\bje\s+aimerai\b(?!\s+(?:demain|bientôt|plus tard|dans))/gi, type: 'conditionnel vs futur (aimerais)' },
    { regex: /\bje\s+voudrai\b(?!\s+(?:demain|bientôt|plus tard|dans))/gi, type: 'conditionnel vs futur (voudrais)' },
    { regex: /\bje\s+pourrai\b(?!\s+(?:demain|bientôt|plus tard|dans))/gi, type: 'conditionnel vs futur (pourrais)' },
    { regex: /\bje\s+saurai\b(?!\s+(?:demain|bientôt|plus tard|dans))/gi, type: 'conditionnel vs futur (saurais)' },
    { regex: /\bje\s+ferai\b(?!\s+(?:demain|bientôt|plus tard|dans))/gi, type: 'conditionnel vs futur (ferais)' },
    { regex: /\bje\s+dirai\b(?!\s+(?:demain|bientôt|plus tard|dans))/gi, type: 'conditionnel vs futur (dirais)' },

    // Expressions de politesse qui nécessitent le conditionnel
    { regex: /\bje\s+(?:souhaiterai|aimerai|voudrai)\s+que\b/gi, type: 'politesse - conditionnel requis' },
    { regex: /\bje\s+(?:souhaiterai|aimerai|voudrai)\s+bien\b/gi, type: 'politesse - conditionnel requis' },

    // Négations avec élision manquante
    { regex: /\bon\s+y\s+(?:va|allait|ira|irait|est|était|sera|serait|a|avait|aura|aurait)\b/gi, type: 'négation manquante (on n\'y)' },
    { regex: /\bon\s+en\s+(?:a|avait|aura|aurait|est|était|sera|serait|va|allait|ira|irait)\b/gi, type: 'négation manquante (on n\'en)' },
    { regex: /\bon\s+(?:a|avait|aura|aurait)\s+(?:pas|plus|jamais|rien)\b/gi, type: 'négation incomplète (il manque ne/n\')' },
    // Élision manquante avec négation
    { regex: /\bon\s+y\s+(?:va|allait|ira|irait|est|était|sera|serait)\b/gi, type: 'élision négation manquante (on n\'y)' },

    // "fait" + infinitive rule - should be invariable
    { regex: /\b(?:ont|avons|avez|as|a)\s+faits\s+(?:dire|faire|voir|savoir|comprendre|entendre|laisser|venir|partir|aller|sortir|entrer|monter|descendre)\b/gi, type: 'fait + infinitif (doit être invariable)' },
    { regex: /\bse\s+(?:sont|sommes|êtes)\s+faits\s+(?:dire|faire|voir|savoir|comprendre|entendre|laisser|venir|partir|aller|sortir|entrer|monter|descendre)\b/gi, type: 'se fait + infinitif (doit être invariable)' },

    // Past participle agreement with avoir when object precedes
    { regex: /\b(?:que|qu[''])\s+\w+\s+(?:ont|avons|avez|as|a)\s+reçu(?![se])\b/gi, type: 'accord participe passé avec avoir (COD avant)' },
    { regex: /\b(?:la|les)\s+\w+\s+(?:que|qu[''])\s+\w+\s+(?:ont|avons|avez|as|a)\s+reçu(?![se])\b/gi, type: 'accord participe passé avec avoir (COD avant)' },

    // Adjective agreement errors
    { regex: /\b(?:une|la)\s+\w*\s+inclue\b/gi, type: 'accord adjectif féminin (incluse)' },
    { regex: /\b(?:une|la)\s+\w*\s+(?:nu|nue)\b/gi, type: 'accord adjectif féminin' },

    // More specific past participle patterns
    { regex: /\b(?:la|cette|une)\s+\w+\s+(?:que|qu[''])\s+\w+\s+(?:ont|avons|avez|as|a)\s+(?:reçu|vu|pris|mis|fait|dit|écrit|lu|su|pu|voulu|dû)(?![se])\b/gi, type: 'accord participe passé (COD féminin avant)' },

    // Past participle agreements (but exclude "fait" + infinitive cases)
    { regex: /j'ai\s+reçu(?![s])(?!\s+\w+er\b)/gi, type: 'participe passé' },
    { regex: /j'ai\s+vu(?![s])(?!\s+\w+er\b)/gi, type: 'participe passé' },
    { regex: /j'ai\s+pris(?![e])(?!\s+\w+er\b)/gi, type: 'participe passé' },
    { regex: /j'ai\s+mis(?![e])(?!\s+\w+er\b)/gi, type: 'participe passé' },
    
    // IMPORTANT: "fait" + infinitive errors (should NOT be flagged as errors)
    // These are CORRECT and should be excluded from error detection
    
    // Incorrect "fait" agreements (these ARE errors)
    { regex: /\b(?:a|ont|avons|avez|as)\s+faits?\s+(?!(?:entrer|sortir|venir|partir|aller|monter|descendre|tomber|rester|devenir|naître|mourir|passer|retourner|arriver)\b)/gi, type: 'fait + infinitif incorrect' },
    
    // Common homophones
    { regex: /\bsa\s+(?=maison|voiture|famille)/gi, type: 'homophone' }, // should be "sa"
    { regex: /\bça\s+(?=va|marche|fonctionne)/gi, type: 'homophone' }, // should be "ça"
    { regex: /\bou\s+(?=bien|alors)/gi, type: 'homophone' }, // might be "où"
    { regex: /\bet\s+(?=alors|puis)/gi, type: 'homophone' }, // might be "est"
    
    // Verb conjugations
    { regex: /\bje\s+(?:vais|va)\b/gi, type: 'conjugaison' }, // should be "je vais"
    { regex: /\btu\s+(?:va|vais)\b/gi, type: 'conjugaison' }, // should be "tu vas"
    { regex: /\bil\s+(?:vais|vas)\b/gi, type: 'conjugaison' }, // should be "il va"
    
    // Adjective agreements
    { regex: /\bune?\s+\w*(?:eau|elle|ette)\s+(?:grand|petit|beau|nouveau)(?![se])/gi, type: 'accord adjectif' },
    
    // Plural agreements
    { regex: /\bdes\s+\w+(?<!s|x|z)\b/gi, type: 'accord pluriel' },
    
    // Elision errors
    { regex: /\bde\s+(?=[aeiouhy])/gi, type: 'élision' }, // should be "d'"
    { regex: /\ble\s+(?=[aeiouhy])/gi, type: 'élision' }, // should be "l'"
    { regex: /\bce\s+(?=[aeiouhy])/gi, type: 'élision' }, // should be "c'"
    
    // Subjunctive mood
    { regex: /\bil\s+faut\s+que\s+\w+\s+(?:vais|vas|va|vont|allez)/gi, type: 'subjonctif' },
    
    // Common spelling errors
    { regex: /\bparmis\b/gi, type: 'orthographe' }, // should be "parmi"
    { regex: /\bmalgres\b/gi, type: 'orthographe' }, // should be "malgré"
    { regex: /\bbiensur\b/gi, type: 'orthographe' }, // should be "bien sûr"
    { regex: /\bpeutetre\b/gi, type: 'orthographe' }, // should be "peut-être"
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
        message: `Erreur possible: ${pattern.type}`
      });
    }
  });
  
  return matches;
}

// Filter out correct "fait + infinitive" constructions
function filterCorrectFaitInfinitive(matches, text) {
  return matches.filter(match => {
    const matchText = text.substring(match.offset, match.offset + match.length);
    
    // Check if this is a "fait + infinitive" construction (which is CORRECT)
    const faitInfinitivePattern = /\b(?:a|ont|avons|avez|as|est|sont|suis|es|sommes|êtes)\s+fait\s+\w+er\b/gi;
    const seFaitPattern = /\bs['']?est\s+fait\s+\w+er\b/gi;
    const seSontFaitPattern = /\bse\s+sont\s+fait\s+\w+er\b/gi;
    
    // If the match overlaps with a correct "fait + infinitive", exclude it
    const isCorrectFait = faitInfinitivePattern.test(text.substring(match.offset - 20, match.offset + match.length + 20)) ||
                         seFaitPattern.test(text.substring(match.offset - 20, match.offset + match.length + 20)) ||
                         seSontFaitPattern.test(text.substring(match.offset - 20, match.offset + match.length + 20));
    
    return !isCorrectFait;
  });
}
function deduplicateMatches(matches) {
  const uniqueMatches = [];
  const processedRanges = [];
  
  matches.sort((a, b) => a.offset - b.offset);
  
  for (const match of matches) {
    const start = match.offset;
    const end = match.offset + match.length;
    
    // Check if this match overlaps with any processed range
    const overlaps = processedRanges.some(range => 
      (start >= range.start && start < range.end) ||
      (end > range.start && end <= range.end) ||
      (start <= range.start && end >= range.end)
    );
    
    if (!overlaps) {
      uniqueMatches.push(match);
      processedRanges.push({ start, end });
    }
  }
  
  return uniqueMatches;
}

async function checkAndDisplayCorrections(sentenceElement) {
  const text = sentenceElement.innerText.trim();
  if (text.length < 3) return;
  
  console.log('Checking text:', text);
  
  // Combine API results with pattern matching
  const apiMatches = await checkWithLanguageTool(text);
  const patternMatches = findCommonFrenchErrors(text);
  
  console.log('API matches:', apiMatches.length);
  console.log('Pattern matches:', patternMatches.length);
  
  const allMatches = [...apiMatches, ...patternMatches];
  
  // Filter out correct "fait + infinitive" constructions
  const filteredMatches = filterCorrectFaitInfinitive(allMatches, text);
  const uniqueMatches = deduplicateMatches(filteredMatches);
  
  console.log('Total unique matches after filtering:', uniqueMatches.length);
  
  if (uniqueMatches.length > 0) {
    displayCorrection(sentenceElement, text, uniqueMatches);
  }
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