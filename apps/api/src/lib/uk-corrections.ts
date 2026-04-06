const ukCorrections: Record<string, string> = {
  'optimize': 'optimise', 'optimized': 'optimised', 'optimizing': 'optimising',
  'organize': 'organise', 'organized': 'organised', 'organizing': 'organising',
  'recognize': 'recognise', 'recognized': 'recognised',
  'personalize': 'personalise', 'personalized': 'personalised',
  'customize': 'customise', 'customized': 'customised',
  'analyze': 'analyse', 'analyzed': 'analysed',
  'color': 'colour', 'colors': 'colours',
  'center': 'centre', 'centered': 'centred',
  'favorite': 'favourite', 'behavior': 'behaviour',
  'fulfill': 'fulfil', 'fulfillment': 'fulfilment',
  'traveled': 'travelled', 'traveling': 'travelling',
  'canceled': 'cancelled', 'canceling': 'cancelling',
};

export function applyUkCorrections(text: string): string {
  let result = text;
  for (const [us, uk] of Object.entries(ukCorrections)) {
    const regex = new RegExp(`\\b${us}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      if (match === match.toUpperCase()) return uk.toUpperCase();
      if (match[0] === match[0].toUpperCase()) return uk.charAt(0).toUpperCase() + uk.slice(1);
      return uk;
    });
  }
  return result;
}
