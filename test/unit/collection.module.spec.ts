import { Test } from '@nestjs/testing';
import { TestingModule } from '@nestjs/testing';
import { CollectionController } from '../../src/collection/collection.controller';
import { CollectionModule } from '../../src/collection/collection.module';
import { COLLECTION_REPOSITORY } from '../../src/collection/collection.tokens';
import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';

describe('CollectionModule', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    await moduleRef?.close();
  });

  it('wires collection dependencies with the default X config', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CollectionModule],
    })
      .overrideProvider(COLLECTION_REPOSITORY)
      .useValue(new InMemoryCollectionRepository(createDefaultCollectionState()))
      .compile();

    const controller = moduleRef.get(CollectionController);
    const config = await controller.getPlatformConfig('x');

    expect(config.variables.regions).toEqual(['global', 'United States', 'United Kingdom', 'Japan', 'Korea']);
    expect(config.variables.regionWoeids).toEqual({
      global: 1,
      'United States': 23424977,
      'United Kingdom': 23424975,
      Japan: 23424856,
      Korea: 23424868,
    });
  });
});
