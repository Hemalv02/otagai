import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict

from app.database.models import Category
from app.database.models.enums import ListingKind
from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.services.categories.service import list_categories

router = APIRouter(prefix="/categories", tags=["categories"])


class CategoryNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    kind: str
    parent_id: uuid.UUID | None
    names: dict[str, Any]
    icon: str | None
    is_risky: bool
    sort_order: int
    children: list["CategoryNode"]


class CategoryList(BaseModel):
    items: list[CategoryNode]


def build_tree(categories: list[Category]) -> list[CategoryNode]:
    nodes = {
        category.id: CategoryNode(
            id=category.id,
            slug=category.slug,
            kind=category.kind,
            parent_id=category.parent_id,
            names=category.names,
            icon=category.icon,
            is_risky=category.is_risky,
            sort_order=category.sort_order,
            children=[],
        )
        for category in categories
    }
    roots: list[CategoryNode] = []
    for category in categories:
        node = nodes[category.id]
        parent = nodes.get(category.parent_id) if category.parent_id else None
        if parent is not None:
            parent.children.append(node)
        else:
            roots.append(node)
    return roots


@router.get("")
async def read_categories(
    user: CurrentUserDep,
    database: DatabaseDep,
    kind: Annotated[ListingKind | None, Query()] = None,
) -> CategoryList:
    categories = await list_categories(database, kind.value if kind else None)
    return CategoryList(items=build_tree(categories))
