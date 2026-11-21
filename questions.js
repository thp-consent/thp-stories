/* THP Stories – the guided interview.
 * Written to follow the One THP Brand Book: people are partners and leaders (not beneficiaries),
 * stories show dignity and strength, facts are checked, and published stories use at most two
 * personal details (e.g. first name + community).
 * Edit freely: question ids (q…) must stay unique so saved answers stay attached.
 */
window.THPQuestions = (() => {
  const PREP = [
    'Consent form signed in the Consent app (one per person; a parent/guardian for every child)',
    'Explained what the story is for and where it may be used',
    'Explained they can skip any question or stop at any time',
    'Asked how they would like to be named (preferred name)',
    'Quiet place found, phone charged / power bank ready, airplane mode on',
    'Short audio test done and played back',
    'Interview language agreed – interpreter present if needed',
  ];

  const SECTIONS = [
    { id: 'about', title: 'About the storyteller', icon: '👤', intro: 'Warm up. Let them introduce themselves in their own way.', qs: [
      { id: 'q01', q: 'Please introduce yourself – the name you would like us to use, and where you live.' },
      { id: 'q02', q: 'Tell me about your family and the people you live with.' },
      { id: 'q03', q: 'What does a normal day look like for you, from morning to evening?', tip: 'Listen for rich detail – sounds, places, routines.' },
      { id: 'q04', q: 'What work or activities do you do to support your family?' },
      { id: 'q05', q: 'What role do you play in your community?', tip: 'Group leader, animator, elder, volunteer…' },
    ] },
    { id: 'before', title: 'Life before', icon: '🕰', intro: 'Context, told with dignity – not pity.', qs: [
      { id: 'q06', q: 'What was life like before you got involved in this work?' },
      { id: 'q07', q: 'What were the biggest challenges you or your family faced?', tip: 'Food, income, health, school fees, water, decision-making…' },
      { id: 'q08', q: 'How did those challenges affect you and the people around you?' },
      { id: 'q09', q: 'Can you remember one moment that shows what things were like then?', tip: 'Ask: when was it, where were you, who was there?' },
    ] },
    { id: 'involved', title: 'Getting involved', icon: '🤝', intro: 'How they took action – they are the leaders of their own change.', qs: [
      { id: 'q10', q: 'How did you first hear about The Hunger Project?' },
      { id: 'q11', q: 'What made you decide to take part?' },
      { id: 'q12', q: 'Which activities, trainings or groups have you been part of?', tip: 'VSLA / savings group, animator training, epicentre, farming, nutrition, leadership, health…' },
      { id: 'q13', q: 'What role have you taken on since then?' },
      { id: 'q14', q: 'What did you learn that was new for you?' },
    ] },
    { id: 'change', title: 'The change', icon: '🌱', intro: 'The heart of the story. Push gently for specifics and numbers.', qs: [
      { id: 'q15', q: 'What has changed for you since then?' },
      { id: 'q16', q: 'Can you give me one specific example of that change?', tip: '“Show, don’t tell” – a scene, an object, a day.' },
      { id: 'q17', q: 'What difference has it made to your income, food, health or your children’s schooling?', tip: 'Ask for numbers: how much / how many, before vs. now. Note them in Facts.', fact: true },
      { id: 'q18', q: 'What can you do now that you could not do before?' },
      { id: 'q19', q: 'How do you feel about yourself now, compared to before?' },
    ] },
    { id: 'turning', title: 'Turning point', icon: '✨', intro: 'The moment that makes the story memorable.', qs: [
      { id: 'q20', q: 'Was there a moment when you realised things were really changing?' },
      { id: 'q21', q: 'Tell me that moment step by step – where were you, who was there, what happened?' },
      { id: 'q22', q: 'How did you feel at that moment?' },
    ] },
    { id: 'resilience', title: 'Challenges & resilience', icon: '💪', intro: 'Honest and transparent – setbacks make the story real.', qs: [
      { id: 'q23', q: 'What has been difficult along the way?' },
      { id: 'q24', q: 'How did you overcome it?' },
      { id: 'q25', q: 'What challenges remain today?' },
      { id: 'q26', q: 'What would help you go even further?' },
    ] },
    { id: 'ripple', title: 'Family & community', icon: '🌍', intro: 'The ripple effect beyond one person.', qs: [
      { id: 'q27', q: 'How have these changes affected your family?' },
      { id: 'q28', q: 'Have others in your community been inspired or joined in?' },
      { id: 'q29', q: 'What has changed in your community as a result?', fact: true },
      { id: 'q30', q: 'Has anything changed in how women and men make decisions or work together?', tip: 'Gender equality is at the heart of THP’s work.' },
    ] },
    { id: 'ahead', title: 'Looking ahead', icon: '🔭', intro: 'Hope and agency – often where the best quote comes from.', qs: [
      { id: 'q31', q: 'What are your hopes for the next few years?' },
      { id: 'q32', q: 'What are your dreams for your children or the next generation?' },
      { id: 'q33', q: 'What would you say to someone in a situation like yours used to be?' },
      { id: 'q34', q: 'What would you like to say to the people who support this work?', tip: 'Great moment for a short video clip.' },
    ] },
    { id: 'closing', title: 'Closing', icon: '🙏', intro: 'Respect and consent to the end.', qs: [
      { id: 'q35', q: 'Is there anything we have not asked that you would like to share?' },
      { id: 'q36', q: 'Is there anything you said that you would prefer we do not include?', tip: 'Note it clearly – respect it in the write-up.' },
      { id: 'q37', q: 'Are you still happy for us to use your photos, video and words as we discussed?' },
    ] },
    { id: 'others', title: 'Other voices', icon: '🗣', intro: 'For family, community leaders, partners or THP staff.', forOthers: true, qs: [
      { id: 'q38', q: 'How do you know the storyteller, and for how long?' },
      { id: 'q39', q: 'What changes have you seen in them?' },
      { id: 'q40', q: 'What has changed in the community, in your view?', fact: true },
      { id: 'q41', q: '(Staff / partners) What is the programme context – when it started, how many people take part, key results?', fact: true },
    ] },
  ];


  /* ---------------------------------------------------------------- other story types
   * Each type has its own guided sections. Question ids are unique across ALL types
   * (q = individual, e = epicentre/facility, h = HOPE-MCH, t = training, g = group), so a story can
   * switch type without losing answers. The Closing section is shared by every type.
   */
  const sec = (id) => SECTIONS.find((x) => x.id === id);
  const ABOUT_SHORT = { id: 'about_s', title: 'About the person', icon: '👤', intro: 'A short warm-up so the story has a face.', qs: [
    { id: 'q01', q: 'Please introduce yourself – the name you would like us to use, and where you live.' },
    { id: 'q02', q: 'Tell me about your family and the people you live with.' },
    { id: 'q04', q: 'What work or activities do you do to support your family?' },
  ] };

  const EPICENTRE = [
    { id: 'e_place', title: 'The place', icon: '🏛', intro: 'What it is, who it serves and who is speaking.', qs: [
      { id: 'e01', q: 'What is this place, and what services does it offer?', tip: 'Clinic, food bank, rural bank, nutrition, literacy, meeting hall, borehole…' },
      { id: 'e02', q: 'When did it open, and who built and runs it?', tip: 'Epicentre committee, community, district assembly, GHS, THP…', fact: true },
      { id: 'e03', q: 'Who uses it – which communities, and roughly how many people?', fact: true },
      { id: 'e04', q: 'What is your own role here?' },
    ] },
    { id: 'e_before', title: 'Before it existed', icon: '🕰', intro: 'Context, told with dignity.', qs: [
      { id: 'e05', q: 'Before this place existed, where did people go for these services?' },
      { id: 'e06', q: 'How far did they travel, and what did it cost in time and money?', fact: true },
      { id: 'e07', q: 'What happened to people who could not reach these services?' },
      { id: 'e08', q: 'Can you remember one moment that shows what things were like then?' },
    ] },
    { id: 'e_build', title: 'Building it together', icon: '🤝', intro: 'The community as the leaders of its own development.', qs: [
      { id: 'e09', q: 'How did the community decide to build or start it?' },
      { id: 'e10', q: 'What did the community contribute – land, labour, money, materials?', fact: true },
      { id: 'e11', q: 'Who led the work, and what role did women play?' },
      { id: 'e12', q: 'What challenges came up while setting it up, and how were they solved?' },
    ] },
    { id: 'e_diff', title: 'The difference it makes', icon: '🌱', intro: 'The heart of the story – push gently for specifics and numbers.', qs: [
      { id: 'e13', q: 'What has changed for the people who use it?' },
      { id: 'e14', q: 'Tell me about one person or family whose life it has changed.', tip: 'A good lead for a separate individual story – note their name in Follow-ups.' },
      { id: 'e15', q: 'What numbers show the change, before vs. now?', tip: 'Patients seen, safe deliveries, loans given, members, food stored, learners…', fact: true },
      { id: 'e16', q: 'How has it changed the way the community works together or makes decisions?' },
      { id: 'e17', q: 'What has it changed for women and girls?' },
    ] },
    { id: 'e_run', title: 'Running it & self-reliance', icon: '⚙️', intro: 'Ownership and sustainability.', qs: [
      { id: 'e18', q: 'Who manages it day to day, and how are decisions made?' },
      { id: 'e19', q: 'How is it funded, and how does it keep going on its own?', fact: true },
      { id: 'e20', q: 'Which links does it have with government or other partners?', tip: 'District assembly, Ghana Health Service, NHIS, schools, banks…' },
      { id: 'e21', q: 'What is hardest about keeping it running?' },
    ] },
    { id: 'e_ahead', title: 'Looking ahead', icon: '🔭', intro: 'Plans and hopes.', qs: [
      { id: 'e22', q: 'What are the plans for the next few years?' },
      { id: 'e23', q: 'What would help it serve more people, or serve them better?' },
      { id: 'e24', q: 'What would you like to say to the people who support this work?', tip: 'Great moment for a short video clip.' },
    ] },
    { id: 'e_others', title: 'Users & other voices', icon: '🗣', intro: 'For people who use the place, staff and leaders.', forOthers: true, qs: [
      { id: 'e25', q: 'How often do you use this place, and for what?' },
      { id: 'e26', q: 'What was it like for you before it was here?' },
      { id: 'e27', q: 'What difference has it made to you or your family?' },
      { id: 'e28', q: 'What would you improve?' },
    ] },
  ];

  const HOPE = [
    ABOUT_SHORT,
    { id: 'h_before', title: 'Before the programme', icon: '🕰', intro: 'Sensitive ground – let them choose what to share.', qs: [
      { id: 'h01', q: 'Before the programme, where did women in your community usually give birth?' },
      { id: 'h02', q: 'How were pregnant women, new mothers and newborns cared for then?' },
      { id: 'h03', q: 'What made it hard to get care – distance, cost, transport, beliefs, permission?' },
      { id: 'h04', q: 'Is there a moment, yours or someone you know, that shows what it was like?', tip: 'Never press on loss. If they become upset, pause or stop – their wellbeing comes first.' },
    ] },
    { id: 'h_reach', title: 'How the programme reached you', icon: '🤝', intro: 'Who supported them and what they learned.', qs: [
      { id: 'h05', q: 'How did you first hear about the programme?' },
      { id: 'h06', q: 'Who supported you?', tip: 'Community health volunteer, midwife, CHPS nurse, mother-to-mother group…' },
      { id: 'h07', q: 'What did you learn about pregnancy, birth, breastfeeding or caring for your baby?' },
      { id: 'h08', q: 'Which services did you use?', tip: 'Antenatal visits, facility birth, postnatal check, immunisation, weighing, family planning, NHIS.', fact: true },
    ] },
    { id: 'h_change', title: 'Mother & child', icon: '👶', intro: 'The heart of the story – specific, personal, with consent.', qs: [
      { id: 'h09', q: 'Tell me about your most recent pregnancy and birth – what was different this time?' },
      { id: 'h10', q: 'How many antenatal visits did you have, where did you give birth, and who was with you?', fact: true },
      { id: 'h11', q: 'How is your child’s health and growth now?' },
      { id: 'h12', q: 'What do you do differently now – feeding, hygiene, or when the child is sick?' },
      { id: 'h13', q: 'How do you feel about your own health and choices now?' },
    ] },
    { id: 'h_family', title: 'Family & community', icon: '🌍', intro: 'The ripple effect, including men’s role.', qs: [
      { id: 'h14', q: 'How has your husband or family been involved?', tip: 'Male involvement is a key part of maternal health – ask both women and men.' },
      { id: 'h15', q: 'Have you shared what you learned with other women? What happened?' },
      { id: 'h16', q: 'What has changed in the community – where women give birth, attitudes, child health?', fact: true },
      { id: 'h17', q: 'Are there still beliefs or barriers that stop women getting care?' },
    ] },
    { id: 'h_ahead', title: 'Looking ahead', icon: '🔭', intro: 'Hope and agency.', qs: [
      { id: 'h18', q: 'What are your hopes for your children?' },
      { id: 'h19', q: 'What would you say to a young woman expecting her first baby?' },
      { id: 'h20', q: 'What more is needed so every mother and baby is safe?' },
    ] },
    { id: 'h_others', title: 'Health workers & other voices', icon: '🗣', intro: 'For midwives, nurses, volunteers, husbands and leaders.', forOthers: true, qs: [
      { id: 'h21', q: 'What is your role in maternal and child health here?' },
      { id: 'h22', q: 'What changes have you seen in mothers and children since the programme began?' },
      { id: 'h23', q: 'What do the numbers show, before vs. now?', tip: 'Antenatal attendance, skilled deliveries, immunisation, malnutrition cases, referrals.', fact: true },
      { id: 'h24', q: 'What challenges remain?' },
    ] },
  ];

  const TRAINING = [
    ABOUT_SHORT,
    { id: 't_before', title: 'Before the training', icon: '🕰', intro: 'Their starting point.', qs: [
      { id: 't01', q: 'What were you doing before the training – your work, farming or role?' },
      { id: 't02', q: 'What was difficult, or what did you want to improve?' },
      { id: 't03', q: 'How did you do things before – methods, practices, results?', tip: 'Get a “before” number if you can: bags per acre, income, clients…', fact: true },
    ] },
    { id: 't_training', title: 'The training', icon: '📚', intro: 'What it was and what stuck.', qs: [
      { id: 't04', q: 'Which training did you take part in – when, where, how long, and who led it?', fact: true },
      { id: 't05', q: 'Why did you decide to join?' },
      { id: 't06', q: 'What was the most important thing you learned?' },
      { id: 't07', q: 'Was anything hard or surprising?' },
      { id: 't08', q: 'How was it taught – demonstrations, a demo farm, practice, role play?' },
    ] },
    { id: 't_practice', title: 'Putting it into practice', icon: '🛠', intro: 'Show, don’t tell.', qs: [
      { id: 't09', q: 'What did you start doing differently afterwards?' },
      { id: 't10', q: 'Show me or tell me exactly how you do it now.', tip: 'Ideal moment for photos or a short video of the practice.' },
      { id: 't11', q: 'What did it take to start – seeds, tools, money, time – and how did you manage?' },
      { id: 't12', q: 'What got in the way?' },
    ] },
    { id: 't_results', title: 'The results', icon: '📈', intro: 'Specific change, with numbers.', qs: [
      { id: 't13', q: 'What results have you seen?' },
      { id: 't14', q: 'What numbers show it, before vs. now?', tip: 'Yield, income, sales, clients, health visits, savings…', fact: true },
      { id: 't15', q: 'How has it changed life for your family?' },
      { id: 't16', q: 'How do you feel about your skills and confidence now?' },
    ] },
    { id: 't_spread', title: 'Passing it on', icon: '🌍', intro: 'The multiplier effect.', qs: [
      { id: 't17', q: 'Have you taught others what you learned? How many?', fact: true },
      { id: 't18', q: 'What have others in the community started doing?' },
      { id: 't19', q: 'What further training or support would help you?' },
    ] },
    { id: 't_ahead', title: 'Looking ahead', icon: '🔭', intro: 'Plans and advice.', qs: [
      { id: 't20', q: 'What are your plans now?' },
      { id: 't21', q: 'What would you tell someone thinking of joining this training?' },
    ] },
    { id: 't_others', title: 'Trainers & other voices', icon: '🗣', intro: 'For trainers, extension officers, health staff and family.', forOthers: true, qs: [
      { id: 't22', q: 'What was the training meant to achieve?' },
      { id: 't23', q: 'How many people took part, and how many are now using what they learned?', fact: true },
      { id: 't24', q: 'What changes have you seen in this person or group?' },
      { id: 't25', q: 'What made it work – or not?' },
    ] },
  ];

  const GROUP = [
    { id: 'g_group', title: 'The group', icon: '👥', intro: 'Who they are.', qs: [
      { id: 'g01', q: 'What is the group, when did it start, and how many members (women and men) does it have?', fact: true },
      { id: 'g02', q: 'What does the group do?' },
      { id: 'g03', q: 'What is your role in it?' },
    ] },
    { id: 'g_before', title: 'Before the group', icon: '🕰', intro: 'Why it was needed.', qs: [
      { id: 'g04', q: 'What was life like for members before the group?' },
      { id: 'g05', q: 'What brought people together to start it?' },
    ] },
    { id: 'g_how', title: 'How it works', icon: '⚙️', intro: 'Leadership and decision-making.', qs: [
      { id: 'g06', q: 'How does the group run – meetings, rules, leaders, elections?' },
      { id: 'g07', q: 'How are decisions made, and does everyone get to speak?' },
      { id: 'g08', q: '(Savings groups) How much has been saved, how many loans given, and what was the last share-out?', fact: true },
      { id: 'g09', q: 'What training or support has the group received?' },
    ] },
    { id: 'g_change', title: 'What has changed', icon: '🌱', intro: 'For members and the wider community.', qs: [
      { id: 'g10', q: 'What has changed for members and their families?' },
      { id: 'g11', q: 'Tell me about one member whose life has changed.', tip: 'A good lead for a separate individual story.' },
      { id: 'g12', q: 'What has the group done for the wider community?', fact: true },
      { id: 'g13', q: 'How have relations between women and men changed?' },
    ] },
    { id: 'g_res', title: 'Challenges & resilience', icon: '💪', intro: 'Honest and real.', qs: [
      { id: 'g14', q: 'What problems has the group faced, and how did you solve them?' },
      { id: 'g15', q: 'What keeps the group going?' },
    ] },
    { id: 'g_ahead', title: 'Looking ahead', icon: '🔭', intro: 'Plans and dreams.', qs: [
      { id: 'g16', q: 'What are the group’s plans and dreams?' },
      { id: 'g17', q: 'What would you say to another community starting a group like yours?' },
    ] },
    { id: 'g_others', title: 'Other voices', icon: '🗣', intro: 'For leaders, partners and families.', forOthers: true, qs: [
      { id: 'g18', q: 'How do you know the group?' },
      { id: 'g19', q: 'What changes have you seen in members and in the community?' },
      { id: 'g20', q: 'How does the group work with leaders, the assembly or other groups?' },
    ] },
  ];

  const TYPES = [
    { id: 'journey', title: 'Individual journey', icon: '🚶🏾‍♀️', desc: 'One person’s story of change, told in their own words.', sections: SECTIONS,
      outline: [['Opening – who they are', ['q01', 'q03']], ['Life before', ['q06', 'q09']], ['Taking action', ['q11', 'q12', 'q13']], ['The change', ['q15', 'q16', 'q17']], ['The turning point', ['q21']], ['The ripple effect', ['q27', 'q29']], ['Looking ahead', ['q31', 'q33', 'q34']]] },
    { id: 'epicentre', title: 'Epicentre or facility', icon: '🏛', desc: 'What an epicentre, clinic, food bank, rural bank or school means for people and organisations.',
      focus: { label: 'Which facility?', options: ['Epicentre', 'Health centre / clinic', 'Food bank', 'Rural bank / microfinance', 'School / literacy centre', 'Water point', 'Other'] },
      sections: [...EPICENTRE, sec('closing')],
      outline: [['The place', ['e01', 'e03']], ['Before', ['e05', 'e06', 'e08']], ['Built by the community', ['e09', 'e10', 'e11']], ['The difference', ['e13', 'e14', 'e15']], ['Owned and sustained', ['e18', 'e19']], ['Looking ahead', ['e22', 'e24']]] },
    { id: 'hope', title: 'HOPE-MCH', icon: '🤱🏾', desc: 'Maternal and child health: safer pregnancies and births, healthier children.',
      sections: [...HOPE, sec('closing')],
      outline: [['Opening – who she is', ['q01', 'q02']], ['Before', ['h01', 'h03', 'h04']], ['Support and learning', ['h06', 'h07']], ['Mother and child', ['h09', 'h11', 'h12']], ['Family and community', ['h14', 'h16']], ['Looking ahead', ['h18', 'h19']]] },
    { id: 'training', title: 'Training impact', icon: '📚', desc: 'What people learned in a training and what changed when they used it.',
      focus: { label: 'Which training?', options: ['Agriculture', 'Climate-smart farming', 'Maternal & child health', 'Nutrition', 'Savings / VSLA', 'Business skills', 'Leadership', 'WASH', 'Other'] },
      sections: [...TRAINING, sec('closing')],
      outline: [['Opening – who they are', ['q01', 'q04']], ['Before', ['t01', 't02', 't03']], ['The training', ['t04', 't06']], ['Putting it into practice', ['t09', 't10']], ['The results', ['t13', 't14', 't15']], ['Passing it on', ['t17', 't18']], ['Looking ahead', ['t20', 't21']]] },
    { id: 'group', title: 'Group or community change', icon: '👥', desc: 'A savings group, women’s group, animators or a whole community acting together.',
      sections: [...GROUP, sec('closing')],
      outline: [['The group', ['g01', 'g02']], ['Why it started', ['g04', 'g05']], ['How it works', ['g06', 'g07', 'g08']], ['What has changed', ['g10', 'g11', 'g12']], ['Resilience', ['g14', 'g15']], ['Looking ahead', ['g16', 'g17']]] },
  ];
  const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[0];

  const SHOTS = [
    'Portrait – looking at the camera, strong and natural',
    'At work – hands and detail',
    'With family',
    'With their group / in the community',
    'Wide shot of the place they live or work',
    'Evidence of change (farm, shop, produce, savings box…)',
    'Short video: their message to supporters (20–30 s)',
    'B-roll video clips (10–20 s each)',
  ];

  const ROLES = ['Storyteller', 'Family member', 'Community leader', 'Group member', 'THP staff', 'Partner', 'Other'];
  const LANGS = ['English', 'Twi', 'Ewe', 'Dagbani', 'Ga', 'Fante', 'Hausa', 'Gonja', 'Other'];
  const THEMES = ['Women & girls', 'Gender equality', 'Agriculture', 'Food & nutrition', 'Savings / VSLA', 'Income & business', 'Health', 'Water & sanitation', 'Education', 'Youth', 'Climate resilience', 'Leadership', 'Child marriage', 'Epicentre'];
  const STATUSES = ['Planned', 'Interviewed', 'Transcribed', 'Drafted', 'Reviewed', 'Approved', 'Published'];
  const MARKERS = [
    { k: 'quote', icon: '⭐', label: 'Great quote' },
    { k: 'fact', icon: '📊', label: 'Number to check' },
    { k: 'emotion', icon: '💛', label: 'Emotional moment' },
    { k: 'follow', icon: '❓', label: 'Follow up' },
    { k: 'photo', icon: '📷', label: 'Photo idea' },
  ];

  const all = []; const seen = new Set();
  TYPES.forEach((t) => t.sections.forEach((sc) => sc.qs.forEach((q) => { if (!seen.has(q.id)) { seen.add(q.id); all.push({ ...q, section: sc.id }); } })));
  return { PREP, SECTIONS, TYPES, typeOf, SHOTS, ROLES, LANGS, THEMES, STATUSES, MARKERS, byId: (id) => all.find((q) => q.id === id), all };
})();
