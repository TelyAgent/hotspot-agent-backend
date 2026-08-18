import { CollectionController } from '../../src/collection/collection.controller';
import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { TwitterCollectionService } from '../../src/collection/twitter-collection.service';
import { ToolRegistry } from '../../src/connectors/tool-registry';
import { createMockTwitterTools } from '../../src/connectors/x/mock-twitter.tools';

describe('CollectionController', () => {
  it('updates X platform variables and runs a configured collection job', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const service = new TwitterCollectionService(repository, tools);
    const controller = new CollectionController(repository, service);

    const updated = await controller.updatePlatformConfig('x', {
      variables: {
        regions: ['US'],
        defaultTrendLimit: 1,
      },
    });
    const run = await controller.runJob('x-trending-default', {});

    expect(updated.variables.regions).toEqual(['US']);
    expect(run.status).toBe('success');
    expect(run.fetchRunId).toBeDefined();
    expect(repository.xTrendSnapshots).toHaveLength(1);
    expect(repository.signals).toHaveLength(1);
  });
});
