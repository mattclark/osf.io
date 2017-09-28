import json

from website.util.permissions import reduce_permissions

from admin.users.serializers import serialize_simple_node


def serialize_node(node):
    embargo = node.embargo
    if embargo is not None:
        embargo = node.embargo.end_date

    return {
        'id': node._id,
        'title': node.title,
        'public': node.is_public,
        'parent': node.parent_id,
        'root': node.root._id,
        'is_registration': node.is_registration,
        'date_created': node.date_created,
        'withdrawn': node.is_retracted,
        'embargo': embargo,
        'contributors': [serialize_simple_user_and_node_permissions(node, user) for user in node.contributors],
        'children': map(serialize_simple_node, node.nodes),
        'deleted': node.is_deleted,
        'pending_registration': node.is_pending_registration,
        'registered_date': node.registered_date,
        'creator': node.creator._id,
        'spam_status': node.spam_status,
        'spam_pro_tip': node.spam_pro_tip,
        'spam_data': json.dumps(node.spam_data, indent=4),
        'is_public': node.is_public,
        'registrations': [serialize_node(registration) for registration in node.registrations.all()],
        'registered_from': node.registered_from._id if node.registered_from else None
    }


def serialize_simple_user_and_node_permissions(node, user):
    return {
        'id': user._id,
        'name': user.fullname,
        'permission': reduce_permissions(node.get_permissions(user))
    }
