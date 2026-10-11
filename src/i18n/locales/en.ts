const en = {
  app: {
    name: 'Twins.MK',
    loading: 'Loading…',
    loadError: 'Could not open the app’s storage. If you are in a private window, try a normal one.',
  },
  nav: {
    main: 'Main',
    checklist: 'Checklist',
    budget: 'Budget',
    shopping: 'Shopping',
    settings: 'Settings',
  },
  common: {
    comingSoon: 'This screen arrives in milestone {{m}}.',
    notSet: 'Not set',
  },
  parents: {
    p1: 'Parent 1',
    p2: 'Parent 2',
  },
  settings: {
    title: 'Settings',
    general: 'General',
    language: 'Language',
    theme: 'Appearance',
    themeSystem: 'Follow phone',
    themeLight: 'Light',
    themeDark: 'Dark',
    family: 'Family',
    thisPhone: 'This phone is used by',
    thisPhoneHint: 'New entries from this phone are marked with this parent.',
    parentName: 'Name of {{parent}}',
    pregnancy: 'Pregnancy',
    dueDate: 'Due date',
    dueDateHint: 'Used for the countdown and for “needed by” weeks in the checklist.',
    progress_one: 'Week {{week}}+{{day}} · {{count}} day to go',
    progress_other: 'Week {{week}}+{{day}} · {{count}} days to go',
    pastDue: 'Due date has passed',
    money: 'Money',
    currency: 'Currency',
    storage: 'Storage',
    persisted: 'Protected: the browser will not clear your data on its own.',
    notPersisted:
      'Not protected yet: the browser may clear data if the phone runs low on space. Installing the app to the home screen usually fixes this. Export backups regularly.',
    persistUnknown: 'This browser does not report whether storage is protected. Export backups regularly.',
  },
  about: {
    title: 'About',
    privacy: 'All data stays on this device. No accounts, no analytics, no trackers.',
    disclaimer:
      'Twins.MK is an organiser, not a medical tool, and gives no medical advice. Checklist quantities and routines are editable suggestions, not recommendations. Always follow the advice of your doctor, midwife or pediatrician.',
    version: 'Version {{version}}',
  },
};

export default en;
export type Translation = typeof en;
