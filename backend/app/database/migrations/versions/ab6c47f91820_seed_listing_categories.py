"""Seed the categories needed to publish tools and skills."""

from alembic import op

revision = "ab6c47f91820"
down_revision = "9af21c6bd07e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO categories (slug, kind, names, is_risky, sort_order)
        VALUES
            ('hand_tools', 'tool',
             '{"en":"Hand tools","ja":"手工具","bn":"হাতের সরঞ্জাম","vi":"Dụng cụ cầm tay"}',
             false, 0),
            ('power_tools', 'tool',
             '{"en":"Power tools","ja":"電動工具","bn":"বিদ্যুৎচালিত সরঞ্জাম","vi":"Dụng cụ điện"}',
             false, 10),
            ('garden_tools', 'tool',
             '{"en":"Garden tools","ja":"園芸用品","bn":"বাগানের সরঞ্জাম","vi":"Dụng cụ làm vườn"}',
             false, 20),
            ('ladders_and_saws', 'tool',
             '{"en":"Ladders and saws","ja":"はしごとのこぎり","bn":"মই ও করাত","vi":"Thang và cưa"}',
             true, 30),
            ('practical_help', 'skill',
             '{"en":"Practical help","ja":"暮らしの手助け","bn":"দৈনন্দিন সাহায্য","vi":"Hỗ trợ hằng ngày"}',
             false, 0),
            ('home_repairs', 'skill',
             '{"en":"Home repairs","ja":"住まいの修理","bn":"বাড়ি মেরামত","vi":"Sửa chữa nhà cửa"}',
             false, 10),
            ('gardening', 'skill',
             '{"en":"Gardening","ja":"庭のお手入れ","bn":"বাগান পরিচর্যা","vi":"Làm vườn"}',
             false, 20),
            ('language_help', 'skill',
             '{"en":"Language help","ja":"ことばの手助け","bn":"ভাষায় সহায়তা","vi":"Hỗ trợ ngôn ngữ"}',
             false, 30)
        ON CONFLICT (slug) DO NOTHING
        """
    )


def downgrade() -> None:
    # Preserve categories that may be referenced by listings or requests.
    pass
