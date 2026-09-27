-- Cuentas por pagar, pagos divididos y balanza pasan a ser funciones que el super admin puede
-- apagar. Los planes existentes las conservan (antes estaban en todos): solo se agregan las claves.
UPDATE "Plan"
SET "features" = ARRAY(SELECT DISTINCT unnest("features" || ARRAY['payables', 'splitPayments', 'scale']))
WHERE NOT ("features" @> ARRAY['payables', 'splitPayments', 'scale']);
