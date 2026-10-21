import { useState } from 'react'
import { useStrings } from '../../i18n'
import { Seg } from '../../ui'
import { DiffPane } from './DiffPane'
import { RegexPane } from './RegexPane'
import { strings } from './strings'

export default function RegexTool() {
  const t = useStrings(strings)
  const [tab, setTab] = useState<'regex' | 'diff'>('regex')
  return (
    <div className="stack">
      <Seg
        label="mode"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'regex', label: t('tabRegex') },
          { value: 'diff', label: t('tabDiff') },
        ]}
      />
      {/* both panes stay mounted so switching tabs never loses what was typed */}
      <div className="stack" hidden={tab !== 'regex'}>
        <RegexPane />
      </div>
      <div className="stack" hidden={tab !== 'diff'}>
        <DiffPane />
      </div>
    </div>
  )
}
