-- Coordinator referral codes: flat ₹400 off any pass (Male/Stag, Girls, Couple).
-- No expiry or usage limit; an owner can edit or deactivate them in
-- Admin → Referral codes. Codes created there earlier are left untouched.
INSERT INTO referral_codes (code, kind, discount_paise, note, created_by)
VALUES ('INT650', 'flat_discount', 40000, 'Coordinator referral code — ₹400 off', 'migration'),
       ('KITTU20', 'flat_discount', 40000, 'Coordinator referral code — ₹400 off', 'migration')
ON CONFLICT (code) DO NOTHING;
