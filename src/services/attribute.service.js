const Attribute = require('../models/Attribute');
const { conflict, notFound } = require('../utils/errors');

class AttributeService {
  async list(filter = {}) {
    const query = {};
    if (filter.category) {
      query.$or = [{ categories: filter.category }, { categories: { $size: 0 } }, { categories: { $exists: false } }];
    }
    if (filter.isActive !== undefined) {
      query.isActive = filter.isActive;
    }
    if (filter.isFilterable !== undefined) {
      query.isFilterable = filter.isFilterable;
    }
    return Attribute.find(query).sort({ order: 1, name: 1 });
  }

  async getById(id) {
    const attribute = await Attribute.findById(id);
    if (!attribute) {
      throw notFound('Attribute not found');
    }
    return attribute;
  }

  async getBySlug(slug) {
    const attribute = await Attribute.findOne({ slug: slug.toLowerCase() });
    if (!attribute) {
      throw notFound('Attribute not found');
    }
    return attribute;
  }

  async create(data) {
    const existing = await Attribute.findOne({ name: new RegExp(`^${data.name}$`, 'i') });
    if (existing) {
      throw conflict(`Attribute "${data.name}" already exists`);
    }
    return Attribute.create(data);
  }

  async update(id, data) {
    const attribute = await Attribute.findById(id);
    if (!attribute) {
      throw notFound('Attribute not found');
    }

    if (data.name && data.name.toLowerCase() !== attribute.name.toLowerCase()) {
      const duplicate = await Attribute.findOne({
        name: new RegExp(`^${data.name}$`, 'i'),
        _id: { $ne: id },
      });
      if (duplicate) {
        throw conflict(`Attribute "${data.name}" already exists`);
      }
    }

    Object.assign(attribute, data);
    return attribute.save();
  }

  async remove(id) {
    const attribute = await Attribute.findById(id);
    if (!attribute) {
      throw notFound('Attribute not found');
    }
    await Attribute.findByIdAndDelete(id);
    return { id, message: `Attribute "${attribute.name}" deleted` };
  }

  async addOption(attributeId, option) {
    const attribute = await this.getById(attributeId);
    const exists = attribute.options.some((opt) => opt.value.toLowerCase() === option.value.toLowerCase());
    if (exists) {
      throw conflict(`Option "${option.value}" already exists for this attribute`);
    }
    attribute.options.push(option);
    return attribute.save();
  }
}

module.exports = new AttributeService();

