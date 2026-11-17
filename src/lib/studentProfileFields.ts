export const requiredTextFields = [
  'passportFamilyName', 'givenName', 'fullName', 'gender', 'maritalStatus', 'religion',
  'occupation', 'nationality', 'dateOfBirth', 'countryOfBirth', 'placeOfBirth',
  'chineseDescent', 'currentlyInChina', 'detailedAddress', 'cityProvince', 'country',
  'zipcode', 'phoneMobile', 'mainEmail', 'passportNo', 'passportExpiryDate', 'studiedInChina',
] as const
export const optionalTextFields = [
  'photo', 'chineseName', 'employerInstitution', 'yearsInHomeCountry', 'wechat', 'homeAddress',
  'oldPassportNo', 'oldPassportExpiry', 'visaType', 'chinaInstitution', 'visaExpiryDate',
  'studyInChinaFrom', 'studyInChinaTo', 'programApplied', 'notes',
] as const
export const feeFields = ['totalFee', 'myCosting'] as const
export const profileFields = [...requiredTextFields, ...optionalTextFields, ...feeFields] as const
