import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { requestReview } from '../../../data/demoAuth';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { errorMessage } from '../errors';

/** Likely duplicate: recover the existing account or ask for review. Never creates a second payee. */
export function DuplicateNotice({ onRecover }: { onRecover: () => void }) {
  const s = useThemedStyles(styles);
  const [ref, setRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const review = () => requestReview().then(setRef).catch((e) => setError(errorMessage(e)));

  return (
    <View style={s.wrap}>
      {error ? <Banner text={error} /> : null}
      {ref ? (
        <Text style={s.copy}>Review requested. Your reference is {ref}. Our team will contact you.</Text>
      ) : (
        <>
          <Button label="Sign in to my account" size="lg" onPress={onRecover} />
          <Button label="This isn't me, request a review" variant="outline" onPress={review} />
        </>
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  copy: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: c.ink },
});
