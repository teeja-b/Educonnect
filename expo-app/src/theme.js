// EduConnect design system
// One place for colours, radii, type and the small building blocks every
// screen uses (cards, info tiles, pills, section dividers, buttons).
import { Platform, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';

export const colors = {
    bg: '#F6F8FC',          // app background
    surface: '#FFFFFF',     // cards
    tile: '#F3F5FA',        // inset info tiles
    border: '#E6EAF2',
    borderStrong: '#D5DCEA',

    text: '#111827',
    textMuted: '#6B7280',
    textSubtle: '#9CA3AF',

    primary: '#2F5BEA',
    primaryDark: '#1E45C8',
    primarySoft: '#E8EEFD',
    primaryRing: '#BFD0FA',

    success: '#10B981',     // filled badges
    successText: '#059669',
    successSoft: '#E6F7EF',

    warning: '#D97706',
    warningSoft: '#FEF5E7',

    danger: '#DC2626',
    dangerSoft: '#FDECEC',

    accent: '#F97316',
};

export const radius = { sm: 10, md: 12, lg: 16, xl: 20, pill: 999 };

export const font = Platform.select({
    web: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
    default: undefined,
});

export const shadow = Platform.select({
    web: { boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' },
    default: { shadowColor: '#111827', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
});

export const PAGE_WIDTH = 760;

// Tone → colours used by score pills, rank badges and metric values
export const tones = {
    success: { fg: colors.successText, bg: colors.successSoft, solid: colors.success },
    primary: { fg: colors.primary, bg: colors.primarySoft, solid: '#3B82F6' },
    warning: { fg: colors.warning, bg: colors.warningSoft, solid: '#F59E0B' },
    neutral: { fg: colors.textMuted, bg: colors.tile, solid: '#9CA3AF' },
    danger: { fg: colors.danger, bg: colors.dangerSoft, solid: colors.danger },
};

// ── Primitives ──────────────────────────────────────────────────────────────

export const Card = ({ style, highlighted, children }) => (
    <View style={[ui.card, highlighted && ui.cardHighlighted, style]}>{children}</View>
);

// Icon + small label + bold value, on a soft tile (the "Subjects / Level" boxes)
export const InfoTile = ({ icon: Icon, label, value, style }) => (
    <View style={[ui.tile, style]}>
        {Icon ? <Icon size={20} color={colors.primary} strokeWidth={1.8} /> : null}
        <View style={{ flex: 1 }}>
            <Text style={ui.tileLabel} numberOfLines={1}>{label}</Text>
            <Text style={ui.tileValue} numberOfLines={2}>{value}</Text>
        </View>
    </View>
);

// Grid of InfoTiles, two per row
export const TileGrid = ({ children }) => <View style={ui.tileGrid}>{children}</View>;

export const Pill = ({ icon: Icon, label, tone = 'primary', onPress, style }) => {
    const t = tones[tone] || tones.primary;
    const Wrap = onPress ? TouchableOpacity : View;
    return (
        <Wrap onPress={onPress} activeOpacity={0.8} style={[ui.pill, { backgroundColor: t.bg }, style]}>
            {Icon ? <Icon size={14} color={t.fg} strokeWidth={2.2} /> : null}
            <Text style={[ui.pillText, { color: t.fg }]}>{label}</Text>
        </Wrap>
    );
};

// Centred pill with hairlines either side ("YOUR LEARNING MATCHES")
export const SectionDivider = ({ label }) => (
    <View style={ui.divider}>
        <View style={ui.dividerLine} />
        <View style={ui.dividerPill}><Text style={ui.dividerText}>{label}</Text></View>
        <View style={ui.dividerLine} />
    </View>
);

export const Avatar = ({ name, size = 44, color = colors.primary }) => {
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    return (
        <View style={[ui.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
            <Text style={[ui.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
        </View>
    );
};

// Rounded-square badge with a short label ("#1")
export const RankBadge = ({ label, tone = 'primary', size = 42 }) => (
    <View style={[ui.rank, { width: size, height: size, backgroundColor: (tones[tone] || tones.primary).solid }]}>
        <Text style={ui.rankText}>{label}</Text>
    </View>
);

export const Button = ({ label, onPress, variant = 'primary', icon: Icon, loading, disabled, style }) => {
    const v = btnVariants[variant] || btnVariants.primary;
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.85}
            style={[ui.btn, v.box, (disabled || loading) && { opacity: 0.5 }, style]}
        >
            {loading ? <ActivityIndicator color={v.fg} /> : (
                <>
                    {Icon ? <Icon size={17} color={v.fg} strokeWidth={2} /> : null}
                    <Text style={[ui.btnText, { color: v.fg }]}>{label}</Text>
                </>
            )}
        </TouchableOpacity>
    );
};

const btnVariants = {
    primary: { box: { backgroundColor: colors.primary }, fg: '#fff' },
    soft: { box: { backgroundColor: colors.primarySoft }, fg: colors.primary },
    outline: { box: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, fg: colors.text },
    success: { box: { backgroundColor: colors.success }, fg: '#fff' },
    danger: { box: { backgroundColor: colors.danger }, fg: '#fff' },
    ghost: { box: { backgroundColor: 'transparent' }, fg: colors.textMuted },
};

export const EmptyState = ({ icon: Icon, title, text, action }) => (
    <Card style={{ alignItems: 'center', paddingVertical: 36 }}>
        {Icon ? (
            <View style={ui.emptyIcon}><Icon size={26} color={colors.primary} strokeWidth={1.8} /></View>
        ) : null}
        <Text style={ui.emptyTitle}>{title}</Text>
        {text ? <Text style={ui.emptyText}>{text}</Text> : null}
        {action ? <View style={{ marginTop: 14, alignSelf: 'stretch' }}>{action}</View> : null}
    </Card>
);

export const ui = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg + 2,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 20,
        marginBottom: 14,
        ...shadow,
    },
    cardHighlighted: { borderColor: colors.primaryRing, borderWidth: 1.5 },

    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: {
        flexGrow: 1, flexBasis: '46%', minWidth: 140,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.tile, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    tileLabel: { fontFamily: font, fontSize: 13, color: colors.textMuted },
    tileValue: { fontFamily: font, fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 1 },

    pill: {
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    },
    pillText: { fontFamily: font, fontSize: 13, fontWeight: '700' },

    divider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginVertical: 16 },
    dividerLine: { height: 1, width: 56, backgroundColor: colors.primaryRing },
    dividerPill: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
    dividerText: { fontFamily: font, fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.primary, textTransform: 'uppercase' },

    avatar: { alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: font, color: '#fff', fontWeight: '700' },

    rank: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    rankText: { fontFamily: font, color: '#fff', fontWeight: '800', fontSize: 15 },

    btn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 18,
    },
    btnText: { fontFamily: font, fontSize: 15, fontWeight: '700' },

    emptyIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    emptyTitle: { fontFamily: font, fontSize: 16, fontWeight: '700', color: colors.text },
    emptyText: { fontFamily: font, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 4, maxWidth: 320 },

    // Typography helpers
    h1: { fontFamily: font, fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
    h2: { fontFamily: font, fontSize: 20, fontWeight: '700', color: colors.text },
    h3: { fontFamily: font, fontSize: 16, fontWeight: '700', color: colors.text },
    body: { fontFamily: font, fontSize: 14, color: '#374151', lineHeight: 21 },
    muted: { fontFamily: font, fontSize: 14, color: colors.textMuted },
});
