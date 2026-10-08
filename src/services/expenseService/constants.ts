/**
 * The fixed list of expense categories, in groups. Keys are stored with each
 * expense and synced, so they must never change; labels can. Icons and colors
 * are in `components/CategoryIcon`.
 */
export const CATEGORY_GROUPS = [
  {
    key: 'entertainment',
    label: 'Entertainment',
    categories: [
      { key: 'entertainment.games', label: 'Games' },
      { key: 'entertainment.movies', label: 'Movies' },
      { key: 'entertainment.music', label: 'Music' },
      { key: 'entertainment.sports', label: 'Sports' },
      { key: 'entertainment.other', label: 'Other' },
    ],
  },
  {
    key: 'food',
    label: 'Food and drink',
    categories: [
      { key: 'food.dining_out', label: 'Dining out' },
      { key: 'food.groceries', label: 'Groceries' },
      { key: 'food.liquor', label: 'Liquor' },
      { key: 'food.other', label: 'Other' },
    ],
  },
  {
    key: 'home',
    label: 'Home',
    categories: [
      { key: 'home.electronics', label: 'Electronics' },
      { key: 'home.furniture', label: 'Furniture' },
      { key: 'home.supplies', label: 'Household supplies' },
      { key: 'home.maintenance', label: 'Maintenance' },
      { key: 'home.mortgage', label: 'Mortgage' },
      { key: 'home.pets', label: 'Pets' },
      { key: 'home.rent', label: 'Rent' },
      { key: 'home.services', label: 'Services' },
      { key: 'home.other', label: 'Other' },
    ],
  },
  {
    key: 'life',
    label: 'Life',
    categories: [
      { key: 'life.childcare', label: 'Childcare' },
      { key: 'life.clothing', label: 'Clothing' },
      { key: 'life.education', label: 'Education' },
      { key: 'life.gifts', label: 'Gifts' },
      { key: 'life.insurance', label: 'Insurance' },
      { key: 'life.medical', label: 'Medical expenses' },
      { key: 'life.taxes', label: 'Taxes' },
      { key: 'life.other', label: 'Other' },
    ],
  },
  {
    key: 'transport',
    label: 'Transportation',
    categories: [
      { key: 'transport.bicycle', label: 'Bicycle' },
      { key: 'transport.bus_train', label: 'Bus or train' },
      { key: 'transport.car', label: 'Car' },
      { key: 'transport.fuel', label: 'Fuel' },
      { key: 'transport.hotel', label: 'Hotel' },
      { key: 'transport.parking', label: 'Parking' },
      { key: 'transport.plane', label: 'Plane' },
      { key: 'transport.taxi', label: 'Taxi' },
      { key: 'transport.other', label: 'Other' },
    ],
  },
  {
    key: 'uncategorized',
    label: 'Uncategorized',
    categories: [{ key: 'general', label: 'General' }],
  },
  {
    key: 'utilities',
    label: 'Utilities',
    categories: [
      { key: 'utilities.cleaning', label: 'Cleaning' },
      { key: 'utilities.electricity', label: 'Electricity' },
      { key: 'utilities.heat_gas', label: 'Heating and gas' },
      { key: 'utilities.trash', label: 'Trash' },
      { key: 'utilities.tv_phone_internet', label: 'TV, phone and internet' },
      { key: 'utilities.water', label: 'Water' },
      { key: 'utilities.other', label: 'Other' },
    ],
  },
] as const

/** The category a new expense starts with. */
export const DEFAULT_CATEGORY = 'general'

/** How many recently used currencies the currency picker lists first. */
export const RECENT_CURRENCY_COUNT = 3
